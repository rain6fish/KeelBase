// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

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

export interface SideEffectRevoker {
  /** 该 revoker 是否能处理此 resultType */
  canHandle(resultType: string): boolean;
  /** 撤销（本地软删 / 外部补偿） */
  revoke(
    resultType: string,
    resultId: number,
    userId: string,
  ): Promise<{ revoked: boolean; message?: string }>;
  /** 目标记录当前状态（列表富化用） */
  describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ title?: string; deletedAt?: Date | null } | null>;
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
  const explicit = entityFor(type);
  if (explicit) return { name: explicit, displayCol: 'title' };

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
  const toTarget = (md: any): LocalEntityTarget => {
    const display = md.columns.find((col: { propertyName: string }) =>
      ['title', 'name', 'subject', 'label'].includes(col.propertyName),
    );
    return { name: md.name, displayCol: display ? display.propertyName : null };
  };

  const metas = em.connection.entityMetadatas;
  for (const md of metas) {
    if (byExact(md) && md.deleteDateColumn) return toTarget(md);
  }

  const looseHits = metas.filter((md) => md.deleteDateColumn && byNormalized(md));
  return looseHits.length === 1 ? toTarget(looseHits[0]) : null;
}

/** 本地实现：软删业务实体（可经 RG-3 回收站恢复）；独立治理库/独立服务后由远程 revoker 替换 */
@Injectable()
export class LocalEntityRevoker implements SideEffectRevoker {
  constructor(@InjectEntityManager() private readonly entityManager: EntityManager) {}

  canHandle(resultType: string): boolean {
    return resolveLocalEntity(this.entityManager, resultType) !== null;
  }

  async revoke(
    resultType: string,
    resultId: number,
    _userId: string,
  ): Promise<{ revoked: boolean; message?: string }> {
    const target = resolveLocalEntity(this.entityManager, resultType);
    if (!target) return { revoked: false, message: '无本地实体可软删' };
    const repo = this.entityManager.getRepository(target.name);
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
}
