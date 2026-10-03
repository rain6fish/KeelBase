// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { pickDisplayColumn } from '../../common/utils/entity-metadata';
import { DERIVED_REFERENCES } from './derived-references';

/**
 * D2-1f 副作用撤销执行器（SideEffectRevoker）——解耦准备：
 * 撤销 AI 副作用不再硬编码业务实体映射，而是通过可替换的 revoker 分派。
 * - 本地实现 LocalEntityRevoker：软删本地业务实体（event/todo/crm_task/pm_task/app_request/contract + 生成模块）
 * - 远程实现（D2-4 独立治理控制平面）：发请求到业务系统补偿端点，替代本地软删
 * - B 路径外部（proxy_call）继续走已有 ExternalRevoker（ProxyToolRevokerService，Java 补偿）
 *
 * #4 修复：除显式别名外，按 TypeORM 实体元数据解析生成模块（type=模块名 → 实体类名），
 * 且仅软删带 DeleteDateColumn 的实体（fail-closed，绝不误删未知/外部目标）。
 */

/** 撤销器注入 token */
export const SIDE_EFFECT_REVOKER = 'SIDE_EFFECT_REVOKER';

/** REV-16：一条派生边上**仍然活着**的引用行数 */
export interface DerivedReferenceCount {
  /** 引用方的表名（给人看的证据） */
  table: string;
  /** 仍指着目标、**未被本次撤销覆盖**、且自身**未被软删**的行数 */
  remaining: number;
}

/** 本次一并撤销的目标（同组 / 同批）——它们即便引用也不该算「留下未了结的引用」 */
export interface RevokedTargetRef {
  resultType: string;
  resultId: number;
}

export interface SideEffectRevoker {
  /** 该 revoker 是否能处理此 resultType */
  canHandle(resultType: string): boolean;
  /**
   * 撤销（本地软删 / 外部补偿）。
   * `manager`：级联补偿时由调用方传入**已开启的事务** manager——同组本地成员必须落在同一事务里，
   * 「一次补偿全成或全不成」才成立（否则「一次补偿」只是营销词）。单条撤销不传。
   */
  revoke(
    resultType: string,
    resultId: number,
    userId: string,
    manager?: EntityManager,
  ): Promise<{ revoked: boolean; message?: string }>;
  /** 目标记录当前状态（列表富化用） */
  describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ title?: string; deletedAt?: Date | null } | null>;
  /**
   * REV-16：该目标类型**已知的派生引用**里，还有多少行指着它。
   *
   * - **`null` = 该类型没有引用模型（未检查）** —— 与「查到 0 条」**不是**一回事，调用方必须把两者分开
   * - 空数组 = 查过、没有东西指着它
   * - 只数**活着**的行：已软删的引用行不算「未失效的下游引用」（它们本身在回收站里）
   */
  countDerivedReferences(
    resultType: string,
    resultId: number,
    alsoRevoked: RevokedTargetRef[],
  ): Promise<DerivedReferenceCount[] | null>;
}

/** resultType → 本地业务实体名（旗舰别名；无映射 = 外部系统目标或需元数据解析）；E-1 快照捕获复用 */
export function entityFor(type: string): string | null {
  switch (type) {
    case 'event':
      return 'Event';
    case 'crm_task':
      return 'CrmTask';
    case 'pm_task':
      return 'PmTask';
    case 'app_request':
      return 'ApprovalRequest';
    case 'contract':
      return 'Contract';
    case 'todo':
      return 'Todo';
    default:
      return null;
  }
}

export interface LocalEntityTarget {
  /** TypeORM 实体类名（getRepository 用） */
  name: string;
  /** 展示列（title/name/…），无则 null（describeTarget 不强取 title，防生成模块无该列） */
  displayCol: string | null;
}

/**
 * 解析本地可撤销目标：显式别名优先；否则按实体元数据（类名/表名匹配 type）解析生成模块，
 * 且要求带 DeleteDateColumn（可软删）。无匹配 → null（外部系统目标，撤销走外部/跳过）。
 *
 * 两段匹配：先精确（大小写不敏感，保持既有行为），未命中再按「去下划线」归一比对。
 * 归一这段的必要性：resultType 由 create_<module> 推导、**保留下划线**（create_followup_plan → followup_plan），
 * 而实体类名经 PascalCase 会**吞掉下划线**（followup_plan → FollowupPlan）、表名是复数（followup_plans），
 * 精确比对三者都不相等 → 多字（snake_case）模块名的生成模块解析失败、撤销落到外部分支报 revoke_failed。
 * 单字模块名（invoice → Invoice）恰好相等，故此前未暴露。
 *
 * 归一兜底要求**唯一命中**：去下划线会让 FooBar 与 Foobar 归一成同一个名字，多命中时不猜——
 * 猜错就是软删了别的业务记录，而「不误删」正是这层治理的全部价值（fail-closed）。
 */
export function resolveLocalEntity(em: EntityManager, type: string): LocalEntityTarget | null {
  const metas = em.connection.entityMetadatas;
  /** 展示列推导——**别名分支与元数据分支同源**，且与回收站共用一处实现（`pickDisplayColumn`） */
  const toTarget = (md: any): LocalEntityTarget => ({
    name: md.name,
    displayCol: pickDisplayColumn(md),
  });

  const explicit = entityFor(type);
  if (explicit) {
    // ⚠ **不可硬编码 displayCol='title'**：别名的展示列并不都是 title —— `Contract` 用 `name`
    // （无 title 列），硬编码会让 describeTarget 去查不存在的属性 → EntityPropertyNotFoundError
    // → 「工具与副作用」列表整体 500（一条 contract 副作用即打挂整个列表）。
    const md = metas.find((m) => m.name === explicit);
    return md ? toTarget(md) : { name: explicit, displayCol: 'title' };
  }

  const wanted = typeof type === 'string' ? type.toLowerCase() : '';
  const normalized = wanted.replace(/_/g, '');
  const namesOf = (md: { name?: string; targetName?: string; tableName?: string }) => [
    md.name,
    md.targetName,
    md.tableName,
  ];
  const byExact = (md: any) =>
    namesOf(md).some((n) => typeof n === 'string' && n.toLowerCase() === wanted);
  const byNormalized = (md: any) =>
    namesOf(md).some((n) => typeof n === 'string' && n.toLowerCase().replace(/_/g, '') === normalized);

  for (const md of metas) {
    if (byExact(md) && md.deleteDateColumn) return toTarget(md);
  }

  const looseHits = metas.filter((md) => md.deleteDateColumn && byNormalized(md));
  return looseHits.length === 1 ? toTarget(looseHits[0]) : null;
}

/** 本地实现：软删业务实体（可经 RG-3 回收站恢复）；独立治理库/独立服务后由远程 revoker 替换 */
@Injectable()
export class LocalEntityRevoker implements SideEffectRevoker {
  private readonly logger = new Logger(LocalEntityRevoker.name);

  constructor(@InjectEntityManager() private readonly entityManager: EntityManager) {}

  canHandle(resultType: string): boolean {
    return resolveLocalEntity(this.entityManager, resultType) !== null;
  }

  async revoke(
    resultType: string,
    resultId: number,
    _userId: string,
    manager?: EntityManager,
  ): Promise<{ revoked: boolean; message?: string }> {
    // 级联补偿传入事务 manager 时，解析与软删都必须走它——否则这一行落在事务外，回滚不覆盖它
    const em = manager ?? this.entityManager;
    const target = resolveLocalEntity(em, resultType);
    if (!target) return { revoked: false, message: '无本地实体可软删' };
    const repo = em.getRepository(target.name);
    const row = await repo.findOne({ where: { id: resultId } } as any);
    if (row) {
      await repo.softDelete(resultId);
    }
    return { revoked: true };
  }

  async describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    const target = resolveLocalEntity(this.entityManager, resultType);
    if (!target) {
      // 外部系统写调用：目标在业务系统（无本地记录），撤销语义在外部
      return { title: '外部系统写调用（B 路径）', deletedAt: null };
    }
    const repo = this.entityManager.getRepository(target.name);
    const select: Record<string, boolean> = { id: true, deletedAt: true };
    if (target.displayCol) select[target.displayCol] = true;
    const row = await repo.findOne({
      where: { id: resultId },
      withDeleted: true,
      select,
    } as any);
    if (!row) return null;
    const title =
      target.displayCol && row[target.displayCol] != null
        ? String(row[target.displayCol])
        : undefined;
    return { title, deletedAt: row.deletedAt ?? null };
  }

  /**
   * REV-16: count the rows that still point at this target, using the registry's known edges.
   *
   * `null` for a type the registry does not cover — **not** an empty list. The distinction is the whole
   * point: an empty list is a checked answer, `null` is the absence of a check, and collapsing them would
   * report "nothing points at this" for every type we never modelled.
   *
   * Rows belonging to targets being revoked in the same operation are excluded: a task that is itself
   * being compensated is part of this action, not a leftover pointing at it. Soft-deleted referrers are
   * excluded too — they are already in the recycle bin, so they are not live downstream state.
   *
   * REV-16：用登记表里已知的边，数还有多少行指着这个目标。
   *
   * 登记表未覆盖的类型返回 `null`，**不是**空列表。这个区分就是全部要点：空列表是一个查过的答案，`null`
   * 是没有查过，把两者塌在一起会让每一个我们从未建模过的类型都报成「没有东西指着它」。
   *
   * 同一次操作里一并撤销的目标所拥有的行排除在外：正在被补偿的那个任务属于本次动作，不是「留下指着它的东西」。
   * 已软删的引用行同样排除 —— 它们已经在回收站里，不是活着的下游状态。
   */
  async countDerivedReferences(
    resultType: string,
    resultId: number,
    alsoRevoked: RevokedTargetRef[],
  ): Promise<DerivedReferenceCount[] | null> {
    const edges = DERIVED_REFERENCES[resultType];
    if (!edges) return null;
    const out: DerivedReferenceCount[] = [];
    for (const edge of edges) {
      // **每条边各自软失败**：这是撤销**之后**跑的辅助读（软删已经提交），一条边查不动不该把整次撤销
      // 变成 500 —— 那正好是「动作已发生、答复是失败」的最坏组合。查不动就跳过并留日志，其余边照报。
      // 如实标注：被跳过的边**没有**被计入，故这个列表是「查得动的那些」的真实值。
      let rows: Array<{ id: number }>;
      try {
        rows = (await this.entityManager.getRepository(edge.table).find({
          where: { [edge.column]: resultId },
          select: { id: true },
        } as any)) as Array<{ id: number }>;
      } catch (err) {
        this.logger.warn(
          `[SideEffectRevoker] REV-16 引用边未查成（${edge.table}.${edge.column}）：${(err as Error).message}`,
        );
        continue;
      }
      const revokedHere = new Set(
        alsoRevoked.filter((t) => t.resultType === edge.ownResultType).map((t) => t.resultId),
      );
      const remaining = rows.filter((r) => !revokedHere.has(Number(r.id))).length;
      if (remaining > 0) out.push({ table: edge.table, remaining });
    }
    return out;
  }
}
