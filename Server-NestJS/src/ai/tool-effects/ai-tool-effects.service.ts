// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import type { ExternalRevoker } from '../proxy/proxy-revoker.service';
import { SIDE_EFFECT_REVOKER } from './side-effect-revoker';
import type { SideEffectRevoker } from './side-effect-revoker';
import { GOVERNANCE_REPORTER } from '../governance/governance-reporter.service';
import type { GovernanceReporter } from '../governance/governance-reporter.service';
import type { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass, type RevokeClass } from '../interfaces/tool.interface';
import type { DeclaredSideEffect } from './effect-composition';
import { paginated } from '../../common/dto/paginated';
import { ConfigService } from '@nestjs/config';
import { LessThan, Not, Raw } from 'typeorm';
import { revokeAge, revokeWindow, DEFAULT_REVOKE_STALE_MINUTES } from './revoke-staleness';
import { SideEffectSnapshotCaptor } from './side-effect-snapshot-captor';

export interface WriteToolContext {
  userId: string;
  conversationId?: string;
  /** KB-5 run 授权 id（run 成员写才有，= run 确认 token；docs/revoke-contract.spec.md §4 G1）。链外注解，不入 _chainPayload */
  runId?: string;
  toolName: string;
  args: Record<string, unknown>;
  /** KB-6：副作用撤销能力档位（可直传；缺省由服务内按工具注册/resultType 兜底解析） */
  revokeClass?: RevokeClass;
}

/** E-1 字段级变更快照（JSON 字符串；create 类 before 为 null） */
export interface SideEffectSnapshot {
  before?: string | null;
  after?: string | null;
}

/** B 路径外部副作用撤销执行器 token（AiModule 提供 ProxyToolRevokerService） */
export const EXTERNAL_REVOKER = 'EXTERNAL_REVOKER';

/** 级联补偿汇总（docs/cascade-compensation.spec.md §5；wire v3 revokeResult.cascade） */
export type RevokeCascadeSummary = {
  groupId: string;
  total: number;
  revoked: number;
  skipped: number;
  failed: number;
};

/** G1 会话级批量撤销：单条结果（skipped 时 revoked=false + reason） */
export type RevokeBatchItem = {
  effectId: number;
  revoked: boolean;
  skipped?: boolean;
  reason?: 'already_revoked' | 'compensating';
  revokeStatus?: 'revoked' | 'compensating' | 'revoke_failed' | null;
  external?: boolean;
  message?: string;
  error?: string;
  /** 级联补偿（v3）：该结果所属补偿组（null/缺省 = 单目标副作用） */
  compensationGroup?: string | null;
  /**
   * REV-1 / REV-5：该行所属补偿组**不得被读成「这次业务动作已完全撤销」**——REV-1 声明与持有不一致，
   * 或 REV-5 另一个活着的补偿组仍主张本组 effect。逐条计数仍是逐行事实（这一行确实被补偿了）。
   * 批量里没有组级结论位（契约也不允许新增顶层键），故由逐条标记承载这个信号。
   */
  disputed?: boolean;
};

/** G1 会话级批量撤销：汇总 + 逐条结果 */
export type RevokeBatchResult = {
  conversationId: string;
  total: number;
  revoked: number;
  skipped: number;
  failed: number;
  results: RevokeBatchItem[];
};

/** §4 G1：run 级批量撤销结果（同会话级形状，作用域键换成 runId） */
export type RevokeRunBatchResult = Omit<RevokeBatchResult, 'conversationId'> & { runId: string };

/** REV-3：跨组重叠（同一业务对象被拆进多个补偿组）的检出条目 */
export interface SplitGroupFinding {
  resultType: string;
  resultId: number;
  /** 该业务对象出现在哪些补偿组里（> 1 即分裂） */
  groups: string[];
  /** 承载它的**已分组**副作用行 id（与 groups 同口径，按登记序） */
  effectIds: number[];
}

/** REV-5：撤销时判出的「**另一个活着的**补偿组仍主张同一 effect」 */
export interface CrossGroupClaim {
  resultType: string;
  resultId: number;
  /** 仍主张该 effect 的其它补偿组（不含本次撤销的组） */
  groups: string[];
}

/** 撤销结果：本地实体 revoked=true（软删）；B 路径外部（proxy_call）external=true（Java 端补偿 / 或诚实语义） */
export type RevokeResult = {
  revoked: boolean;
  effectId: number;
  external?: boolean;
  compensated?: boolean;
  message?: string;
  /** KB-6：撤销后回写的运维态（revoked=本地软删 / compensating=已请求外部补偿·结果未知 / revoke_failed=补偿失败） */
  revokeStatus?: 'revoked' | 'compensating' | 'revoke_failed';
  /** 单条撤销的幂等跳过标记（已撤销 / 已请求补偿 → 不重复触发） */
  skipped?: boolean;
  reason?: string;
  /** 级联补偿（v3）：该副作用所属补偿组（null/缺省 = 单目标副作用） */
  compensationGroup?: string | null;
  /** 级联补偿（v3）：整组汇总（仅组内成员数 > 1 时返回） */
  cascade?: RevokeCascadeSummary;
};

/** 唯一约束冲突判定（postgres 23505 / sqlite SQLITE_CONSTRAINT / UNIQUE constraint message）——仅此类错误才可按幂等 skip（KB-4 FP-4） */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string }).code ?? '';
  const msg = (err as Error).message ?? '';
  return (
    code === '23505' ||
    code.includes('SQLITE_CONSTRAINT') ||
    msg.includes('SQLITE_CONSTRAINT') ||
    /UNIQUE constraint failed/i.test(msg)
  );
}

/** REV-1：成员比对用的**目标身份**（正是 `memberKey` 消费的业务载荷）。不含声明下标。 */
function targetKey(e: { resultType: string; resultId: number }): string {
  return `${e.resultType}:${e.resultId}`;
}

/**
 * REV-1：争议证据（JSON 存 `revoke_dispute` 列，**链外注解**）。
 * 留存「被拒的那份声明」与双向差集，使「少记录」这一静默失败变成可查的事实。
 */
export interface RevokeDisputeEvidence {
  /** 被拒的那份声明（重试声明的原样内容） */
  declared: DeclaredSideEffect[];
  /** 当时**已持有**的成员 */
  stored: DeclaredSideEffect[];
  /** 声明里有、持有里没有 —— 会被静默丢弃的那几条（撤销该组时补偿不到） */
  onlyDeclared: DeclaredSideEffect[];
  /** 持有里有、声明里没有 —— 重试声明**更少**的情形 */
  onlyStored: DeclaredSideEffect[];
  decidedAt: string;
}

/**
 * REV-1：比对「被拒声明」与「已持有组」的成员集合，**双向**求差（重试也可能声明**更少**）。
 * 一致 → null（纯幂等重放，既有行为不变）。按目标身份比集合、**不按声明下标比位置**：
 * 问题在于覆盖（哪几条补偿不到），下标只决定根成员与幂等键，不决定某一条会不会被补偿。
 */
function declarationDiff(
  declared: DeclaredSideEffect[],
  stored: DeclaredSideEffect[],
): { onlyDeclared: DeclaredSideEffect[]; onlyStored: DeclaredSideEffect[] } | null {
  const storedKeys = new Set(stored.map(targetKey));
  const declaredKeys = new Set(declared.map(targetKey));
  const onlyDeclared = declared.filter((e) => !storedKeys.has(targetKey(e)));
  const onlyStored = stored.filter((e) => !declaredKeys.has(targetKey(e)));
  if (onlyDeclared.length === 0 && onlyStored.length === 0) return null;
  return { onlyDeclared, onlyStored };
}

/**
 * HS-3 写工具幂等与补偿：
 * - 幂等：同会话同工具同参数（idempotencyKey）重复调用返回已有结果，防 LLM 重试/并发重复创建
 * - 可撤销：记录副作用（resultType+resultId），管理台可软删对应 event/todo（衔接 RG-3 回收站）
 */
@Injectable()
export class AiToolEffectsService {
  private readonly logger = new Logger(AiToolEffectsService.name);

  constructor(
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    @Optional() @Inject(SIDE_EFFECT_REVOKER)
    private readonly revoker?: SideEffectRevoker,
    @Optional() @Inject(EXTERNAL_REVOKER)
    private externalRevoker?: ExternalRevoker,
    // D2-3c：可选治理上报（业务系统配 GOVERNANCE_URL 时副作用双写）
    @Optional() @Inject(GOVERNANCE_REPORTER)
    private readonly reporter?: GovernanceReporter,
    // G-3（§internal.17 ① G-3）：副作用哈希链（AuditChainService，ai.module 已 import AuditChainModule；缺失降级不链化）
    @Optional() private readonly auditChain?: AuditChainService,
    // KB-6：工具注册表（解析副作用撤销能力档位快照；ToolRegistry 为 AiModule provider，构造器注入）
    @Optional() private readonly toolRegistry?: ToolRegistry,
    // G-3 链写入串行化（postgres 走 DB 锁事务；缺失则退化为进程内串行）——见 _withChainWrite
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
    /**
     * docs/cascade-compensation.spec.md §6：补偿自身入 operation_audit（该表入哈希链 → 补偿自动入链）。
     * @Optional：治理台/单测装配可能没有 OperationAuditModule（缺则该链降级为无显式补偿行）。
     */
    @Optional() private readonly operationAudit?: OperationAuditService,
    /** REV-2：陈旧阈值来源（`REVOKE_STALE_MINUTES`）。@Optional：单测装配可省，省则用默认值。 */
    @Optional() private readonly configService?: ConfigService,
    /**
     * REV-9：撤销前重读目标，用作「还是不是我写的那条」的比对源。**必须与写入时同一个捕获器**
     * ——`after_snapshot` 就是它产的，换一个实现去读会得到不可比的形状（归一化不同即永远「漂移」）。
     * @Optional：缺失时判不了，如实不报（见 `_targetDrift`）。
     */
    @Optional() private readonly snapshotCaptor?: SideEffectSnapshotCaptor,
  ) {}

  /**
   * REV-9：比对前剔掉「记账用」时间戳。
   *
   * 快照是对**整行**的投影（`SideEffectSnapshotCaptor._sanitize` 只剔敏感字段），而 `updatedAt` 每次写都会动
   * ⇒ 留着它，任何一次触碰都会被读成「目标被改过」，而**用噪音报出来的东西没人会看**——那等于把这次检查关掉。
   * 故只比**内容**：剔除 `createdAt` / `updatedAt` 这两个由 ORM 维护的记账列，其余一律参与比对。
   *
   * **如实写出的边界**：这条规则只认这两列是「非内容」。某个业务列若也会为无关原因自行变动（计数器之类），
   * 它仍会被读成漂移——那属于**误报**而非漏报，且会点名是哪个字段，可据此再收紧。
   */
  private static readonly DRIFT_IGNORED_KEYS = new Set(['createdAt', 'updatedAt']);

  /** 快照 JSON → 可比对的内容视图（键序归一 + 剔记账列）；解析不了返回 null（不猜）。 */
  private _contentOnly(snapshotJson: string | null | undefined): Record<string, unknown> | null {
    if (!snapshotJson) return null;
    try {
      const parsed = JSON.parse(snapshotJson) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(parsed as Record<string, unknown>).sort()) {
        if (AiToolEffectsService.DRIFT_IGNORED_KEYS.has(k)) continue;
        out[k] = (parsed as Record<string, unknown>)[k];
      }
      return out;
    } catch {
      return null;
    }
  }

  /**
   * REV-9：**撤销前问一句「目标还是不是我写的那条」**。
   *
   * 撤销路径原先只读「是不是软删了」（`revokeStatus` / 目标 `deletedAt`），`after_snapshot` 从不参与判定
   * ⇒ AI 写入之后、撤销之前若有人或别的系统改过该目标，撤销**照样软删并报成功**，把中间那次改动一并抹掉
   * 且毫无提示。本方法把那件事变成**可检出**。
   *
   * 返回 `null` = **判不了，或未漂移**（两种情况在处置上相同：不添任何话）；返回字符串 = 漂移的**字段名清单**。
   * 判不了的情形都如实不报，不假装未漂移也不假装漂移：无捕获器（没装配）、无 `after_snapshot`（该行身份本就
   * 缺「变更」那半，REV-6 已单独标注）、当前行读不到（已删 / 已迁走）、快照解析不了。
   *
   * **边界**：只做「可检出、不静默」——不拒绝、不改判定、不写争议列、不动 wire 契约。
   */
  private async _targetDrift(effect: AiToolSideEffect): Promise<string | null> {
    if (!this.snapshotCaptor) return null;
    const before = this._contentOnly(effect.afterSnapshot);
    if (!before) return null;
    let currentJson: string | null;
    try {
      currentJson = await this.snapshotCaptor.captureAfter(effect.resultType, effect.resultId);
    } catch {
      return null;
    }
    const now = this._contentOnly(currentJson);
    if (!now) return null;
    if (JSON.stringify(before) === JSON.stringify(now)) return null;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]))
      .sort();
    return keys.join(', ');
  }

  /**
   * REV-9：把漂移事实**加到人读消息上**（单条与组内成员共用一处措辞，免得两条路各写一句）。
   *
   * 为什么走 `message` 而不是新增结构化键：**两条路的 wire 开放度不同** —— 单条结果 `revokeResult` 是
   * `additionalProperties: true`（加键不破契约），而**批量逐条** `item` 与 `revokeBatch` 是 `false`
   * （加键要升版本）。漂移这件事两条路都要答，若只在单条加键，就变成「同一状态、两条路两个形状」
   * ——正是本仓反复修的那类缺陷。`message` 是两条路**都有且都开放**的那个面，故用它；
   * 要结构化字段，得先让两条路的形状同向（升版本或统一），那是另一步。
   */
  private _withDriftNote(message: string | undefined, drift: string | null): string | undefined {
    if (!drift) return message;
    const note = `⚠ 目标在写入后被改过（${drift}），本次补偿把该改动一并抹除`;
    return message ? `${message}；${note}` : note;
  }

  /** REV-2：陈旧阈值（分钟）——配置缺失时回落到与 Joi 默认一致的常量，避免两处各写一个数。 */
  private _staleThresholdMinutes(): number {
    const configured = this.configService?.get<number>('REVOKE_STALE_MINUTES');
    return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_REVOKE_STALE_MINUTES;
  }

  /** AiModule useFactory 组装 B 路径 revoker（ToolRegistry 非 provider，运行时注入） */
  setExternalRevoker(revoker: ExternalRevoker): void {
    this.externalRevoker = revoker;
  }

  /** 幂等键：sha256(userId:conversationId:toolName:stableArgsJson) */
  static buildKey(ctx: WriteToolContext): string {
    const stable = JSON.stringify(sortKeys(ctx.args));
    const seed = `${ctx.userId}:${ctx.conversationId ?? ''}:${ctx.toolName}:${stable}`;
    return createHash('sha256').update(seed).digest('hex');
  }

  /**
   * 复合写工具组内成员幂等键（docs/cascade-compensation.spec.md §4）：基键 + 区分度。
   * 同组多行若共用基键，`idempotency_key` 唯一约束会把整组塌成一行——区分度是必需的，不是优化。
   * 用**声明下标**而非登记顺序：重试时同一成员映射到同一键（幂等语义才成立）。
   */
  static memberKey(baseKey: string, index: number, resultType: string, resultId: number): string {
    return createHash('sha256').update(`${baseKey}:${index}:${resultType}:${resultId}`).digest('hex');
  }

  /**
   * 尝试幂等返回：同 key 已有副作用 → 返回 { existing: true, effect }。
   * 否则返回 { existing: false }，调用方执行工具后用 record 落库。
   */
  async findExisting(
    key: string,
  ): Promise<{ existing: boolean; effect?: AiToolSideEffect }> {
    const effect = await this.effectsRepo.findOne({
      where: { idempotencyKey: key },
    });
    if (effect) return { existing: true, effect };
    return { existing: false };
  }

  /** 记录写工具副作用（execute 成功后调用）；resultType: event/todo/crm_task；snapshot 为 E-1 字段级变更快照 */
  async record(
    ctx: WriteToolContext,
    resultType: string,
    resultId: number,
    snapshot?: SideEffectSnapshot,
  ): Promise<AiToolSideEffect> {
    const key = AiToolEffectsService.buildKey(ctx);
    const base = {
      idempotencyKey: key,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      // §4 G1：run 成员副作用记 runId（链外列，_chainPayload 白名单不含 → 不入链，不破历史链）
      runId: ctx.runId ?? null,
      toolName: ctx.toolName,
      argsHash: this._argsHash(ctx),
      resultType,
      resultId,
      beforeSnapshot: snapshot?.before ?? null,
      afterSnapshot: snapshot?.after ?? null,
      // KB-6：副作用发生时刻的撤销能力档位快照（ctx 直传优先；否则按工具注册/resultType 兜底）
      revokeClass: ctx.revokeClass ?? this._resolveSnapshotClass(ctx.toolName, resultType),
      // 单目标行不属于任何补偿组（历史语义逐字节不变）
      compensationGroup: null,
      parentEffectId: null,
    };
    // G-3（§internal.17 ① G-3）：新行入副作用哈希链（prev = 最近一条已哈希行；历史行 null 不参与；首个哈希行 genesis）。
    // 链写入 = read(prev) → compute → insert，是 read-modify-write：**必须串行**，否则并发两行读到同一 prev
    // → 同 prevHash 两分支 → 链分叉（verifySideEffectChain 判 invalid）。见 _withChainWrite。
    return this._saveSingle(ctx, base, key, resultType, resultId);
  }

  /**
   * 复合写工具登记（docs/cascade-compensation.spec.md §4）：一次调用跨表落多行，同属一个补偿组。
   * - 组标识 = 该次调用的**幂等基键** → 重试天然映射同一组，无需另生成 uuid。
   * - 整组在**一个**链写上下文内登记（postgres 单事务单锁 / sqlite 单队列任务）→ 组内链相邻、登记原子，
   *   杜绝「N 次独立提交 → 提交一半的半组」。
   * - 任一成员唯一冲突 → 整组回滚 → 回放既有整组（幂等重试语义）。
   */
  async recordGroup(
    ctx: WriteToolContext,
    effects: DeclaredSideEffect[],
    snapshots?: Array<SideEffectSnapshot | undefined>,
  ): Promise<AiToolSideEffect[]> {
    const baseKey = AiToolEffectsService.buildKey(ctx);
    // REV-6：成组成员的**身份必须能承载变更**（after 快照）。缺了就是 `identity_incomplete` 的行 ——
    // 撤销时的跨组判定只能拿它比目标、比不出变更。此处如实标注，不静默放行，也**不**拒绝登记
    // （业务行已写进目标表，拒登只会让这次写没有任何副作用行 = 撤销够不到，把可恢复换成不可恢复）。
    const missingChange = effects.map((_, i) => snapshots?.[i]?.after == null);
    if (missingChange.some(Boolean)) {
      const n = missingChange.filter(Boolean).length;
      this.logger.warn(
        `[AiToolEffects] compensation group ${baseKey}: ${n}/${effects.length} 成员无变更快照（identity_incomplete）` +
          `——该组身份只能承载目标、承载不了变更，跨组判定退化为「碰了同一行」`,
      );
    }
    const save = async (manager?: EntityManager): Promise<AiToolSideEffect[]> => {
      const saved: AiToolSideEffect[] = [];
      for (let i = 0; i < effects.length; i++) {
        const e = effects[i];
        const base = {
          idempotencyKey:
            i === 0
              ? baseKey
              : AiToolEffectsService.memberKey(baseKey, i, e.resultType, e.resultId),
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          runId: ctx.runId ?? null,
          toolName: ctx.toolName,
          argsHash: this._argsHash(ctx),
          resultType: e.resultType,
          resultId: e.resultId,
          beforeSnapshot: snapshots?.[i]?.before ?? null,
          afterSnapshot: snapshots?.[i]?.after ?? null,
          revokeClass: ctx.revokeClass ?? this._resolveSnapshotClass(ctx.toolName, e.resultType),
          compensationGroup: baseKey,
          // REV-6：身份缺变更那半的行如实标注（链外注解列；单目标行不属于组，不标）
          identityIncomplete: missingChange[i],
          // 根成员恒为第 0 条（spec §3）：根 parentEffectId=null，其余指向根（登记序保证根先落库）
          parentEffectId: i === 0 ? null : (saved[0]?.id ?? null),
        };
        saved.push(await this._insertOne(base, manager));
      }
      return saved;
    };

    try {
      const saved = await this._withChainWrite(save);
      this._reportEffect(ctx, effects[0].resultType, effects[0].resultId);
      return saved;
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // 非唯一冲突：不伪装幂等命中（与 record 同口径）
        throw err;
      }
      this.logger.warn(`[AiToolEffects] recordGroup conflict (idempotent replay): ${(err as Error).message}`);
      const existing = await this.listGroup(baseKey);
      // REV-1：回放之前先比一次声明与持有 —— 不比对就是「静默少记录」（撤销该组只补偿持有的那些行、汇总全绿）。
      await this._markDisputeIfDeclarationDiffers(baseKey, effects, existing);
      this._reportEffect(ctx, effects[0].resultType, effects[0].resultId);
      return existing;
    }
  }

  /**
   * REV-1：被拒声明与已持有组不一致 → 留存证据并把整组标为争议。
   *
   * 触发条件：同参数重试在幂等键上冲突（→ 整组回滚 → 回放既有组），而工具**非确定性**，两次声明的成员不同
   * （多声明或少声明都算）。此时回放的那一组**不覆盖**本次声明 —— 沉默地回放它，就等于把「这部分已撤销」
   * 说成事实。标记后撤销路径据 `revokeDispute` **拒绝报告完成**（见 `_withDisputeNote` / `_groupResult`）。
   *
   * 证据写在**根行**（组内主体对象，`parent_effect_id IS NULL`）上，一处即够：撤销路径按**组**判定
   * （`_compensateGroup` 载入全组后 `members.some(m => m.revokeDispute)`），单成员组的唯一一行本来就是根行。
   * 逐行复制只会把同一份证据放大成 O(N²) 文本、并在写入失败时留下互相不一致的副本 —— 单一副本是单一事实。
   * 列是**链外注解**，不入 `_chainPayload`，故不破历史链。标记写入失败只告警——它不改变业务事实，
   * 权威的补偿语义仍由逐行 revoke_status 与目标软删信号承载。
   */
  private async _markDisputeIfDeclarationDiffers(
    baseKey: string,
    declared: DeclaredSideEffect[],
    stored: AiToolSideEffect[],
  ): Promise<void> {
    if (stored.length === 0) return; // 无既有行可标（唯一冲突来自别处）→ 不制造无处可读的标记
    // 两侧都按**目标引用**比（行对象本身带一堆链列/注解列，混进证据只会稀释它）
    const storedRefs = stored.map((e) => ({ resultType: e.resultType, resultId: e.resultId }));
    const diff = declarationDiff(declared, storedRefs);
    if (!diff) return;
    const evidence: RevokeDisputeEvidence = {
      declared,
      stored: storedRefs,
      onlyDeclared: diff.onlyDeclared,
      onlyStored: diff.onlyStored,
      decidedAt: new Date().toISOString(),
    };
    this.logger.warn(
      `[AiToolEffects] compensation group ${baseKey} disputed: 声明 ${declared.length} 条 vs 持有 ${stored.length} 条` +
        `（声明多出 ${diff.onlyDeclared.length}、持有多出 ${diff.onlyStored.length}）——撤销将拒绝报告完成`,
    );
    // 根行：与 _auditCompensation 同一定义（parent_effect_id 为空者；异常形态回落登记序首行）
    const root = stored.find((r) => r.parentEffectId == null) ?? stored[0];
    await this._patchRevoke(root, { revokeDispute: JSON.stringify(evidence) });
  }

  /** 载入整组副作用（补偿组内全部行，按 id 升序 = 登记序；根在最前） */
  async listGroup(compensationGroup: string): Promise<AiToolSideEffect[]> {
    return this.effectsRepo.find({
      where: { compensationGroup } as any,
      order: { id: 'ASC' },
    });
  }

  /** 参数 hash（幂等键与追溯共用同一摘要口径） */
  private _argsHash(ctx: WriteToolContext): string {
    return createHash('sha256')
      .update(JSON.stringify(sortKeys(ctx.args)))
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * 串行化副作用链写入（镜像 AuditService.log 的双保险做法；2026-09-12 补齐——此前本链是裸 read-modify-write，
   * 并发写会分叉，而链完整性是信任工件）。
   * - **postgres**：事务内锁 `audit_chain_lock` 行（id=2；与主审计链 id=1 分开，避免两链互相串行）→ 读 prev →
   *   插入 → 提交。插入必须走 `runner.manager` 且在锁内提交——否则锁释放早于插入落库，后到者仍读到旧 prev。
   * - **单写者（sqlite/better-sqlite3）**：进程内 promise 串行（跨进程仍为 best-effort，与主链 sqlite 分支同）。
   * 幂等语义不变：唯一冲突 → skip 并回读已有行；其他 DB 错误如实上抛（KB-4 FP-4）。
   */
  private async _saveSingle(
    ctx: WriteToolContext,
    base: Record<string, unknown>,
    key: string,
    resultType: string,
    resultId: number,
  ): Promise<AiToolSideEffect> {
    let saved: AiToolSideEffect | undefined;
    try {
      saved = await this._withChainWrite((manager) => this._insertOne(base, manager));
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // 非唯一冲突（DB down / 连接中断等）：不伪装幂等命中——副作用未落库却报成功会造成重复执行，必须上抛
        throw err;
      }
      this.logger.warn(`[AiToolEffects] record conflict (idempotent skip): ${(err as Error).message}`);
      const existing = await this.effectsRepo.findOne({ where: { idempotencyKey: key } });
      this._reportEffect(ctx, resultType, resultId);
      return existing!;
    }
    this._reportEffect(ctx, resultType, resultId);
    return saved!;
  }

  /**
   * 链写上下文：把一段「读 prev → 算 hash → 插入」的 read-modify-write **串行化**，否则并发写读同一 prev
   * → 链分叉（verifySideEffectChain 判 invalid）。单行登记与复合组登记共用本上下文：
   * - **postgres**：事务内锁 `audit_chain_lock` 行（id=2；与主审计链 id=1 分开，避免两链互相串行）→ 执行 fn →
   *   提交。fn 内的插入必须走 `runner.manager` 且在锁内提交——否则锁释放早于插入落库，后到者仍读到旧 prev。
   *   传同一个 manager 还能让组内后续成员读到**本事务内**前序成员（组内链相邻 + 登记原子）。
   * - **单写者（sqlite/better-sqlite3）**：进程内 promise 串行 **+ 真事务包裹整段**（跨进程仍为 best-effort，
   *   与主链 sqlite 分支同）。事务是「整组一次登记」的兑现——原先只串行不包裹，组内中途失败会留下**半组**
   *   （前几条已提交、后几条没有），而 `recordGroup` 的契约恰恰承诺「杜绝半组」；dev/test 默认走的就是这条路径。
   */
  private async _withChainWrite<T>(fn: (manager?: EntityManager) => Promise<T>): Promise<T> {
    if (this.dataSource?.options.type === 'postgres') {
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query(
          `INSERT INTO "audit_chain_lock" (id, holder) VALUES (2, 'side-effect') ON CONFLICT (id) DO NOTHING`,
        );
        await runner.query('SELECT id FROM "audit_chain_lock" WHERE id = 2 FOR UPDATE');
        const out = await fn(runner.manager);
        await runner.commitTransaction();
        return out;
      } catch (err) {
        await runner.rollbackTransaction().catch(() => {});
        throw err;
      } finally {
        await runner.release();
      }
    }
    // Serialise in-process **and** wrap the whole stretch in a real transaction, so a group is
    // all-or-nothing. Without the transaction a mid-group failure left the earlier members
    // committed — the half-group that `recordGroup` promises never to produce.
    // 进程内串行 **+ 真事务**包裹整段，使整组要么全登记、要么全不登记；没有事务时组内中途失败
    // 会留下半组（前几条已提交），与 `recordGroup` 的契约相反。
    const run = () => (this.dataSource ? this.dataSource.transaction((m) => fn(m)) : fn());
    const job = this._chainTail.then(run);
    this._chainTail = job.catch(() => {});
    return job;
  }

  /** 链内插入一行（须在 _withChainWrite 提供的上下文内调用，prev 才读到同事务/同批次的前序行） */
  private async _insertOne(
    base: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<AiToolSideEffect> {
    let chain: { prevHash: string | null; hash: string } | undefined;
    if (this.auditChain) {
      const prev = await this._lastSideEffectHash(manager);
      chain = { prevHash: prev ?? null, hash: this.auditChain.computeHash(prev, this._chainPayload(base)) };
    }
    const repo = manager ? manager.getRepository(AiToolSideEffect) : this.effectsRepo;
    return repo.save(repo.create({ ...base, ...(chain ?? {}) } as Partial<AiToolSideEffect>));
  }

  /** G-3 链写入串行队列（sqlite 等单写者；postgres 走 DB 锁，不依赖此队列） */
  private _chainTail: Promise<unknown> = Promise.resolve();

  /**
   * KB-6：解析副作用撤销能力档位快照。工具注册表命中 → 用工具显式/推导值（含 ProxyTool 显式档位）；
   * 未注册（生成模块等动态工具）→ 按 revoker.canHandle(resultType) 兜底（本地可软删 → local_compensate，否则 none）。
   */
  private _resolveSnapshotClass(toolName: string, resultType: string): RevokeClass {
    try {
      const tool = this.toolRegistry?.getTool(toolName);
      if (tool) return resolveRevokeClass(tool);
    } catch {
      // tool 未注册：落入 resultType 兜底
    }
    return this.revoker?.canHandle(resultType)
      ? 'local_compensate'
      : 'none';
  }

  /** G-3：副作用链 canonical payload（稳定字段；AuditChainService canonical 排序键 → 写入/校验一致） */
  private _chainPayload(row: Record<string, unknown>): Record<string, unknown> {
    return {
      idempotencyKey: row.idempotencyKey ?? null,
      userId: row.userId ?? null,
      conversationId: row.conversationId ?? null,
      toolName: row.toolName ?? null,
      argsHash: row.argsHash ?? null,
      resultType: row.resultType ?? null,
      resultId: row.resultId ?? null,
      beforeSnapshot: row.beforeSnapshot ?? null,
      afterSnapshot: row.afterSnapshot ?? null,
    };
  }

  /** G-3：最近一条已哈希副作用行的 hash（接链用；无 → null genesis） */
  private async _lastSideEffectHash(manager?: EntityManager): Promise<string | null> {
    const row = await (manager ? manager.getRepository(AiToolSideEffect) : this.effectsRepo)
      .createQueryBuilder('e')
      .select('e.hash', 'hash')
      .where('e.hash IS NOT NULL')
      .orderBy('e.id', 'DESC')
      .limit(1)
      .getRawOne<{ hash: string }>();
    return row?.hash ?? null;
  }

  /** G-3：副作用哈希链完整性校验（仅校验已哈希行；历史 null 行不在链内） */
  async verifySideEffectChain(): Promise<{ valid: boolean; checked: number; hashed: number; firstHashedId: number | null }> {
    if (!this.auditChain) return { valid: true, checked: 0, hashed: 0, firstHashedId: null };
    const rows = await this.effectsRepo.find({ order: { id: 'ASC' } });
    const hashed = rows.filter((r) => r.hash);
    const res = this.auditChain.verifyChain(
      hashed,
      (row) => this._chainPayload(row as unknown as Record<string, unknown>),
    );
    return { valid: res.valid, checked: res.checked, hashed: hashed.length, firstHashedId: hashed[0]?.id ?? null };
  }

  /**
   * REV-3 **检出**：同一 `resultType + resultId`（同一业务对象）出现在**多个**补偿组 → 一次业务动作被拆成两组。
   *
   * 为什么难发现：组分键吃的是**调用身份**（userId/conversationId/toolName/args），其中 `conversationId` 会在
   * 工具毫不知情的情况下变（会话 id 缺失或查不到时 `_resolveConversation` 会**新建**会话；载荷多一个
   * continuation token 同理）。于是同一个 effect 落进两组，**两组各自内部自洽完整**：唯一冲突永不触发、
   * 幂等回放根本不执行，记录里没有任何地方读起来异常 —— 比「少记录」（至少留下一次冲突）更难察觉。
   *
   * **检出之外还有闸门**（REV-5）：撤销时**自己**再判一次（`_crossGroupClaims`），命中就拒绝报完成。
   * 检出回答「历史与全局上哪些对象被拆过」，闸门回答「这一次撤销能不能说完成」——两个问题，两个落点。
   *
   * **组键不动**（2026-09-24 裁决）：把组键改成吃**主体 effect 身份**（参数降为 args_hash 证据）会让两次
   * **合法**调用触碰同一主体行时被并组，而并错方向的代价不可恢复（撤销够到没人要求够到的 effect，
   * 撤销不能倒着跑）；而少记录 / 分裂都是可恢复的（撤销可以再跑一次）。
   *
   * 无 LLM、无猜测：只报「哪些业务对象横跨多个组」这一可从库中判定的事实。
   */
  async findSplitGroups(
    limit = 100,
  ): Promise<{ count: number; truncated: boolean; splits: SplitGroupFinding[] }> {
    // 检出结果条数上限与 list() 同口径（≤100）：本端点每条要找一次承载行，不放开成无界放大面。
    const capped = Math.min(Math.max(limit, 1), 100);
    // 库侧分组聚合（双方言均支持 COUNT(DISTINCT)/HAVING）——不要把全表拉进内存自己分组。
    // 多取一条用于如实报告「还有更多」：检出器绝不能在自身能力边界上沉默。
    const pairs = await this.effectsRepo
      .createQueryBuilder('e')
      .select('e.resultType', 'resultType')
      .addSelect('e.resultId', 'resultId')
      .where('e.compensationGroup IS NOT NULL')
      .groupBy('e.resultType')
      .addGroupBy('e.resultId')
      .having('COUNT(DISTINCT e.compensation_group) > 1')
      .orderBy('e.resultType', 'ASC')
      .addOrderBy('e.resultId', 'ASC')
      .limit(capped + 1)
      .getRawMany<{ resultType: string; resultId: number | string }>();
    const truncated = pairs.length > capped;
    const shown = truncated ? pairs.slice(0, capped) : pairs;
    const splits: SplitGroupFinding[] = [];
    for (const p of shown) {
      const resultId = Number(p.resultId);
      const rows = await this.effectsRepo.find({
        where: { resultType: p.resultType, resultId } as any,
        order: { id: 'ASC' },
      });
      // 只列**已分组**的行：`groups` 与 `effectIds` 必须同口径，否则「这几行属于哪些组」会自相矛盾
      // （无组的单目标行不属于本次分裂，但它确实存在于同一业务对象上——那一层事实由 list/治理视图呈现）。
      const grouped = rows.filter(
        (r): r is typeof r & { compensationGroup: string } =>
          typeof r.compensationGroup === 'string' && r.compensationGroup.length > 0,
      );
      splits.push({
        resultType: p.resultType,
        resultId,
        groups: [...new Set(grouped.map((r) => r.compensationGroup))],
        effectIds: grouped.map((r) => r.id),
      });
    }
    return { count: splits.length, truncated, splits };
  }

  /**
   * REV-5 **闸门**：本次要撤销的这组，组内每个成员是否还有**别的活着的组**也主张同一 `resultType + resultId`。
   *
   * 为什么只有在撤销时问得出来：**写时每一组各自内部都是正确的**——唯一冲突不触发、幂等回放不执行，
   * 记录里没有任何东西读起来异常，检查在那里**没有主语**；而活下来的那个组**仍指着刚被撤销的 effect**，
   * 这个失败只在撤销进行时才可察（docs/revoke-contract.spec.md §5.3）。
   *
   * 「活着」= 该组承载同一 effect 的那行 `revoke_status` 不是 `revoked` —— 已补偿完的组不再主张它。
   *
   * **保守方向**：只回答「另一个组还主张这个 effect」，**答不出**「那个组是否还留有本次撤销覆盖不到的成员」。
   * 前者命中就拒绝报完成（可恢复：撤销可以再跑一次）；若反过来把「其实还有存活部分」判成无碍，
   * 得到的是不可恢复的「报完成而实未完成」——与「不换组键」同一条取舍。
   * （REV-6 补齐成组成员的变更快照后，这里才谈得上把比对从「碰了同一行」细化到「是否同一变更」。）
   */
  private async _crossGroupClaims(
    groupId: string,
    members: Array<Pick<AiToolSideEffect, 'resultType' | 'resultId'>>,
  ): Promise<CrossGroupClaim[]> {
    if (members.length === 0) return [];
    // 按**目标**圈定候选行，再在内存里按「同组 / 已补偿完」过滤：成员的 (resultType,resultId) 至多几条，
    // 而库侧聚合会把「哪个组主张了哪一行」这层还原丢掉，判定需要的是组与行的对应关系。
    const rows = await this.effectsRepo.find({
      where: members.map((m) => ({
        resultType: m.resultType,
        resultId: m.resultId,
        compensationGroup: Not(groupId),
      })) as any,
    });
    const byTarget = new Map<string, CrossGroupClaim>();
    for (const r of rows) {
      if (!r.compensationGroup || r.compensationGroup === groupId) continue;
      if (r.revokeStatus === 'revoked') continue; // 已补偿完的组不再主张
      const key = targetKey(r);
      const found = byTarget.get(key);
      if (found) {
        if (!found.groups.includes(r.compensationGroup)) found.groups.push(r.compensationGroup);
      } else {
        byTarget.set(key, {
          resultType: r.resultType,
          resultId: r.resultId,
          groups: [r.compensationGroup],
        });
      }
    }
    return [...byTarget.values()].sort(
      (a, b) => a.resultType.localeCompare(b.resultType) || a.resultId - b.resultId,
    );
  }

  /** 本次撤销相关的跨组主张（组内全部成员；单目标行不属于任何组 → 空，不查库） */
  private async _claimsForRevoke(effect: AiToolSideEffect): Promise<CrossGroupClaim[]> {
    if (!effect.compensationGroup) return [];
    const members = await this.listGroup(effect.compensationGroup);
    return this._crossGroupClaims(effect.compensationGroup, members.length ? members : [effect]);
  }

  /**
   * 组级争议说明（空数组 = 无争议 → 可以报完成）。单一判据，组级汇总与批量标记共用：
   * REV-1「声明与持有不一致」 / REV-5「另一个活组仍主张本组 effect」。
   */
  private _disputeNotes(members: AiToolSideEffect[], cross: CrossGroupClaim[]): string[] {
    const notes: string[] = [];
    if (members.some((m) => m.revokeDispute != null)) {
      notes.push(
        '已按**持有**的行补偿，但该组**声明与持有不一致**（组已标 disputed）——不得视为该业务动作已完全撤销',
      );
    }
    if (cross.length) notes.push(this._crossClaimText(cross));
    return notes;
  }

  /** REV-5：跨组主张的读法（撤销结论里要说得出「是哪个组、主张了哪个对象」） */
  private _crossClaimText(claims: CrossGroupClaim[]): string {
    const detail = claims
      .map((c) => `${c.resultType}#${c.resultId}（补偿组 ${c.groups.join('、')}）`)
      .join('；');
    return `另有**活着的**补偿组仍主张本次撤销的业务对象：${detail}——那一组承载的业务动作不随本次撤销结束，故不得视为已完全撤销`;
  }

  /** REV-1：读争议证据。列内容由本服务写入；读侧不因一行坏数据让整页 500 —— 解析失败返回 null，`disputed` 仍为 true。 */
  private _parseDispute(raw: string | null | undefined): RevokeDisputeEvidence | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RevokeDisputeEvidence;
    } catch {
      return null;
    }
  }

  /** D2-3c：副作用双写上报治理台（配置 GOVERNANCE_URL 时；失败静默） */
  private _reportEffect(ctx: WriteToolContext, resultType: string, resultId: number): void {
    if (!this.reporter?.enabled) return;
    void this.reporter
      .reportEffect({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        toolName: ctx.toolName,
        args: ctx.args,
        resultType,
        resultId,
      })
      .catch(() => {});
  }

  /** KB-6/deferred④：撤销可点 = 服务端单一权威（status=executed 且档位非 none）；三端据此渲染，不各自复制判定 */
  private _isRevocable(
    revokeClass: string | null | undefined,
    status: string,
  ): boolean {
    if (status !== 'executed') return false;
    return (
      revokeClass === 'local_compensate' ||
      revokeClass === 'governed_external' ||
      revokeClass === 'transactional'
    );
  }

  /** 管理台：按用户/类型列出 AI 创建的副作用（含目标记录当前状态） */
  async list(options: { userId?: number; page?: number; limit?: number; stale?: boolean } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const where: Record<string, unknown> = {};
    if (options.userId !== undefined) where.userId = String(options.userId);

    // REV-2：只看「陈旧未了结」时在库侧过滤（compensating 且请求时刻早于 now − 阈值）。
    // 请求时刻为 NULL 的旧行天然不匹配 —— 与 revokeAge 对它们「年龄未知，故不判陈旧」的口径一致，
    // 不把「查不到年龄」悄悄算成「陈旧」。
    const thresholdMinutes = this._staleThresholdMinutes();
    if (options.stale === true) {
      where.revokeStatus = 'compensating';
      where.revokeRequestedAt = LessThan(new Date(Date.now() - thresholdMinutes * 60_000));
    }

    const [items, total] = await this.effectsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // 附带目标记录当前状态（软删则标注可恢复）
    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        // REV-2：`compensating` 的年龄与陈旧度。只回答「多久了 / 可能已陈旧」，
        // 真值仍在目标系统 —— 不据此把 revokeStatus 改写成成功或失败。
        const age = revokeAge(effect.revokeStatus, effect.revokeRequestedAt, new Date(), thresholdMinutes);
        // REV-2 细化：同一条 `compensating` 还分两个窗口 —— 「可能根本没到达」（无确认凭据）与
        // 「确实到达了但对方没给终态」（有确认凭据）。此前两者读数相同，聚合视图因此不诚实。
        const window = revokeWindow(effect.revokeStatus, effect.revokeAcknowledgedAt);
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值），供前端据档位诚实渲染（none 不显示撤销钮）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // REV-2：补偿请求时刻 + 年龄 + 陈旧标记（阈值由服务端配置，前端不必硬编码）
          revokeRequestedAt: effect.revokeRequestedAt ? effect.revokeRequestedAt.toISOString() : null,
          revokePending: age.pending,
          revokeAgeMinutes: age.ageMinutes,
          revokeStale: age.stale,
          // REV-2 细化：确认时刻 + 窗口（unacknowledged = 可能未到达 / awaiting_target = 已到达无回音）
          revokeAcknowledgedAt: effect.revokeAcknowledgedAt
            ? effect.revokeAcknowledgedAt.toISOString()
            : null,
          revokeWindow: window,
          // REV-1：该组是否「声明与持有不一致」——标记 + 证据（被拒声明与双向差集），供管理端解释为何撤销未报完成
          disputed: effect.revokeDispute != null,
          dispute: this._parseDispute(effect.revokeDispute),
          // REV-6：该行身份缺「变更」那半（成组行登记时无变更快照）——读取侧不得默认为完整身份
          identityIncomplete: effect.identityIncomplete === true,
          // 级联补偿（v3）：组标识 + 根引用，供前端显示「这是 N 条中的第 M 条」
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this._summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    return paginated(enriched, total, page, limit);
  }

  /**
   * AI Action Center（§internal.17 北极星用户侧，docs/ai-action-center.spec.md）：本人 AI 写副作用清单 + 归一状态 + 目标富化。
   * 数据最小化：不回显 args/argsHash/before/after 快照（字段级证据走 B4/审计面）；人类标签由前端按 toolName 映射（D2 toolLabel）。
   * status 归一：目标软删（targetSoftDeleted=true）→ revoked，否则 executed。
   */
  /**
   * D2：从 before/after 快照导出紧凑「实际状态变化」摘要——kind（created/updated/unknown）+ 变更字段名。
   * 只给字段名（不给全量值），列表载荷可控；详细 diff 仍走动作详情（FieldDiff）。
   */
  private _summarizeChange(
    beforeRaw: string | null | undefined,
    afterRaw: string | null | undefined,
  ): { kind: 'created' | 'updated' | 'unknown'; fields: string[] } {
    const parse = (raw: string | null | undefined): Record<string, unknown> | null => {
      if (!raw) return null;
      try {
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    const before = parse(beforeRaw);
    const after = parse(afterRaw);
    if (!before && after) return { kind: 'created', fields: Object.keys(after) };
    if (before && after) {
      const fields = Object.keys(after).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      return { kind: 'updated', fields };
    }
    return { kind: 'unknown', fields: [] };
  }

  async listOwned(userId: string, options: { page?: number; limit?: number } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    const [items, total] = await this.effectsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值，禁把 governed_external 显示为 revoked）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this._summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    return paginated(enriched, total, page, limit);
  }

  /**
   * P0-14：按对话取副作用（含目标记录当前状态），供用户可见的执行轨迹用。
   * 复用 _loadTarget 富化，按 createdAt 升序。
   */
  /**
   * B4 治理视图：按业务动作（resultType+resultId，如 crm_task:42）反查 AI 副作用（供「业务动作 → 治理轨迹」展示）。
   *
   * The pair is not naturally unique for result types with no local entity: rows written before the
   * proxy identity carried a user dimension can share one pair across users. Both consequences are
   * handled here rather than at each call site — `viewerUserId` narrows the lookup to that user, so a
   * viewer can neither be served someone else's effect nor get a 403 that leaks its existence; and
   * `order` makes "which row" deterministic, so an admin or service identity that passes no viewer
   * still gets a stable answer instead of whatever the driver returned first.
   *
   * 该二元组对**无本地实体**的 resultType 不天然唯一：在代理身份带上用户维度之前写入的行，
   * 可能跨用户共享同一对值。两个后果都在此处理，不推给每个调用点：`viewerUserId` 把查询收窄到
   * 该用户，查看者既拿不到他人的副作用、也不会吃到「存在但不属于你」的 403（那泄露行的存在）；
   * `order` 让「取到哪一行」确定，不传查看者的管理员 / 服务身份也拿到稳定答案。
   */
  async findByTarget(
    resultType: string,
    resultId: number,
    viewerUserId?: string,
  ): Promise<AiToolSideEffect | null> {
    const where: Record<string, unknown> = { resultType, resultId };
    if (viewerUserId !== undefined) where.userId = viewerUserId;
    return this.effectsRepo.findOne({ where: where as any, order: { id: 'ASC' } });
  }

  /**
   * A-3 恢复态（docs/cascade-compensation.spec.md §7）：**补偿过但目标当前未软删** → 已恢复。
   * 依据：`revoke_status='revoked'` 证明补偿发生过；`targetSoftDeleted=false` 证明目标现已回到生效态
   * （回收站 restore 只清 deletedAt、**不动** revoke_status，故两者组合即「撤销后又恢复」这一历史事实）。
   * 单一权威：规则在此一处，前端不各自复制判定。
   */
  isRestored(effect: AiToolSideEffect, targetSoftDeleted: boolean): boolean {
    return effect.revokeStatus === 'revoked' && !targetSoftDeleted;
  }

  /** B4/A-3 生命周期富化：副作用目标记录当前状态（是否存在/软删/标题）——撤销态判定依赖 targetSoftDeleted */
  async describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ targetExists: boolean; targetSoftDeleted: boolean; targetTitle: string | null }> {
    const target = await this._loadTarget(resultType, resultId);
    return {
      targetExists: !!target,
      targetSoftDeleted: target?.deletedAt != null,
      targetTitle: target?.title ?? null,
    };
  }

  /**
   * KB-6：读时 revokeClass 兜底（旧行/未快照行）。工具注册命中优先；否则按本地可软删推导。
   */
  private _readRevokeClass(effect: AiToolSideEffect): RevokeClass {
    if (effect.revokeClass) return effect.revokeClass as RevokeClass;
    return this._resolveSnapshotClass(effect.toolName, effect.resultType);
  }

  /**
   * KB-6：status 归一（4 值），供 list/listOwned/listForConversation 共用。
   * - targetSoftDeleted（本地 live 信号权威，RG-3 回收站恢复后自动回 executed）→ revoked
   * - 否则按 revoke_status：compensating → revoking_external（已请求外部补偿·结果未知，禁 revoked）；
   *   revoke_failed → revoke_failed；null/其他 → executed
   * 兼容：旧本地已撤行经 targetSoftDeleted 仍 revoked；旧 proxy 行 class 兜底 none → executed（前端据此藏钮）。
   */
  private _normalizeStatus(effect: AiToolSideEffect, targetSoftDeleted: boolean): string {
    if (targetSoftDeleted) return 'revoked';
    switch (effect.revokeStatus) {
      case 'compensating':
        return 'revoking_external';
      case 'revoke_failed':
        return 'revoke_failed';
      default:
        return 'executed';
    }
  }

  /** §internal.16 A-2 业务实体账本：按实体取全部 AI 副作用（时间升序，供行为史聚合） */
  async findManyByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect[]> {
    return this.effectsRepo.find({
      where: { resultType, resultId } as any,
      order: { createdAt: 'ASC' },
    });
  }

  async listForConversation(conversationId: string) {
    const items = await this.effectsRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt.toISOString(),
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（执行轨迹面同样据档位诚实渲染）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
        };
      }),
    );
  }

  /** 撤销 AI 副作用：软删目标 event/todo/crm_task（可经 RG-3 回收站恢复） */
  async revoke(effectId: number): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect) return null;
    return this._concludeSingle(effect);
  }

  /**
   * P0-15 用户侧撤销：仅本人可撤销自己的 AI 副作用。
   * 非本人/不存在 → null（controller 转 404）；目标软删可经 RG-3 回收站恢复。
   */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect || effect.userId !== userId) return null;
    return this._concludeSingle(effect);
  }

  /**
   * 单条撤销的**结论层**：单条撤销的响应**就是**结论本身，故两个争议判据（REV-1 声明与持有不一致、
   * REV-5 另一个活组仍主张）都在此施加（批量路径不降级：那里逐条计数是逐行事实，只带 `disputed` 标记）。
   *
   * 多成员组例外：那条路的结论已在 `_groupResult` 里连同争议说明一起给出（`cascade` 即该形态的标记），
   * 这里不再把同一句话追加第二遍；跳过路径没有组汇总，故在**施加之前**先判一次。
   */
  private async _concludeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    const reason = await this._skipReason(effect);
    if (reason) {
      return this._withDisputeNote(
        effect,
        this._skippedResult(effect, reason),
        await this._claimsForRevoke(effect),
      );
    }
    const result = await this._doRevoke(effect);
    if (result.cascade) return result;
    return this._withDisputeNote(effect, result, await this._claimsForRevoke(effect));
  }

  /**
   * G1 会话级批量撤销（revoke-contract §3 Case B）：一键撤销某会话（一次对话/run 近似）的 AI 写副作用。
   * - ownerId 提供 → 只撤该用户本人的（AI Action Center 本人作用域）；否则（admin）撤该会话全部
   * - 逐条复用 _doRevoke（档位门控 none 拒绝 / local 软删 / external 补偿），已撤销或已请求外部补偿
   *   （revokeStatus revoked/compensating）跳过不重复触发；revoke_failed 视为可重试
   * - 返回逐条结果 + 汇总，便于前端一键撤销后展示部分失败
   */
  async revokeConversation(
    conversationId: string,
    opts?: { ownerId?: string },
  ): Promise<RevokeBatchResult> {
    const effects = await this.effectsRepo.find({
      where: { conversationId } as any,
      order: { createdAt: 'ASC' },
    });
    return { conversationId, ...(await this._revokeBatch(effects, opts)) };
  }

  /**
   * §4 G1：run 级批量撤销——精确撤销「某次 run 一次性授权」产生的全部副作用（比会话级更细：
   * 一个对话可含多次 run）。逐条复用档位门控撤销（同 revokeConversation），汇总逐条结果。
   */
  async revokeRun(runId: string, opts?: { ownerId?: string }): Promise<RevokeRunBatchResult> {
    const effects = await this.effectsRepo.find({
      where: { runId } as any,
      order: { createdAt: 'ASC' },
    });
    return { runId, ...(await this._revokeBatch(effects, opts)) };
  }

  /** 批量撤销公共循环（revokeConversation / revokeRun 共用；owner 过滤 + 逐条档位门控 + 汇总） */
  private async _revokeBatch(
    effects: AiToolSideEffect[],
    opts?: { ownerId?: string },
  ): Promise<{
    total: number;
    revoked: number;
    skipped: number;
    failed: number;
    results: RevokeBatchItem[];
  }> {
    // 以「未提供」判据而非真值判据：ownerId 为空串等 falsy 值时不得静默升级为 admin 全作用域
    const ownerFilter = opts?.ownerId;
    const scoped =
      ownerFilter !== undefined ? effects.filter((e) => e.userId === ownerFilter) : effects;
    const results: RevokeBatchItem[] = [];
    let revoked = 0;
    let skipped = 0;
    let failed = 0;
    // 级联补偿折叠（docs/cascade-compensation.spec.md §5）：同组只补偿一次——否则一个 N 成员组会被补偿 N 次。
    // 逐条结果按成员摊平，前端仍看到「一条一行」。组分支必须**先于** skipReason 判定：
    // 若首个成员恰是可跳过态（已撤销/补偿中），提前 continue 会让整组根本不被处理。
    const processedGroups = new Set<string>();
    const scopedIds = new Set(scoped.map((e) => e.id));
    // REV-1 / REV-5：争议组的行在批量里也必须**读得出**。逐条计数本身是逐行事实（这一行确实被补偿了），
    // 但若只剩一个光秃秃的 `revoked:3 / failed:0`，批量读起来就是「这次业务动作已完全撤销」——正是要拦的那个读数。
    // 判定按**组**（标记只在根行上，故逐行看会漏；跨组主张同样只能按组问）。
    const withDispute = (disputed: boolean, item: RevokeBatchItem): RevokeBatchItem =>
      disputed ? { ...item, disputed: true } : item;
    for (const effect of scoped) {
      const groupId = effect.compensationGroup;
      // REV-1 / REV-5：争议是**组级**事实（标记在根行；跨组主张要按组问），故按组判定后摊到逐条结果上
      let disputed = effect.revokeDispute != null;
      if (groupId) {
        if (processedGroups.has(groupId)) continue;
        processedGroups.add(groupId);
        try {
          const members = await this.listGroup(groupId);
          const claims = await this._crossGroupClaims(groupId, members);
          disputed = this._disputeNotes(members, claims).length > 0;
          if (members.length > 1) {
            const { items } = await this._compensateGroup(effect, groupId, members, claims);
            for (const it of items) {
              if (!scopedIds.has(it.effectId)) continue;
              results.push(withDispute(disputed, it));
              if (it.revoked) revoked++;
              else if (it.skipped) skipped++;
              else failed++;
            }
            continue;
          }
        } catch (err) {
          failed++;
          results.push(
            withDispute(disputed, {
              effectId: effect.id,
              revoked: false,
              error: (err as Error).message,
              compensationGroup: groupId,
            }),
          );
          continue;
        }
      }
      const skipReason = await this._skipReason(effect);
      if (skipReason) {
        skipped++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: false,
            skipped: true,
            reason: skipReason,
            compensationGroup: groupId ?? null,
          }),
        );
        continue;
      }
      try {
        const r = await this._doRevoke(effect);
        // ARC-7：`compensating`（已请求外部补偿、结果未知）既不是 revoked 也不是 failed。
        // 此前它落进 `revoked++`——同一次业务动作于是在单条说「未完成」、在批量说「已撤销」，
        // 而管理台 toast 念的正是这三个数（`aiCenterConvRevokeDone`）。
        if (r.revoked) revoked++;
        else if (r.skipped) skipped++;
        else failed++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: r.revoked,
            skipped: r.skipped,
            reason: r.reason === 'already_revoked' || r.reason === 'compensating' ? r.reason : undefined,
            revokeStatus: r.revokeStatus ?? null,
            external: r.external ?? false,
            message: r.message,
            compensationGroup: groupId ?? null,
          }),
        );
      } catch (err) {
        failed++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: false,
            error: (err as Error).message,
            compensationGroup: groupId ?? null,
          }),
        );
      }
    }
    return { total: scoped.length, revoked, skipped, failed, results };
  }

  /** 撤销跳过判据（单条/批量共用）：已软删 revoked / 已请求外部补偿 compensating；revoke_failed 视为可重试 */
  /**
   * 幂等判据：**这一行到底做完了没有**。
   *
   * ARC-1：此前只看 `revokeStatus === 'revoked'`，而读侧 `isRestored` 要求「revoked **且** 目标仍未软删」
   * ——**同一条状态、两条路两个结论**：一条撤销后从回收站恢复的行（目标又活了），撤销侧仍报
   * `already_revoked`（即 `revoked:true`），而列表侧早已按 `targetSoftDeleted` 把它读成 `executed`。
   * 于是「撤销报完成，而那条业务动作仍然活着」。现取**同一判据**：`revoked` **且目标仍在软删态**才算完成；
   * 目标已复活 ⇒ 不算完成 ⇒ 走正常撤销路径（读侧本来就是这么建模的：恢复 ⇒ 这条又活了）。
   *
   * **只在有本地软删语义时**才这么判：`describeTarget` 对**外部**副作用返回的是占位
   * `{deletedAt: null}`（「撤销语义在外部」，不是「目标活着」），照它判会把外部行读成未完成而**重复补偿**。
   * 故以 `_classOf === 'local_compensate'` 且 revoker 认这个 resultType 为门。
   *
   * 目标读不到（无 revoker / 行不存在）⇒ **判不了**，按完成处理——保守方向是「不因读不到就去重复补偿」。
   */
  private async _skipReason(
    effect: AiToolSideEffect,
  ): Promise<'already_revoked' | 'compensating' | null> {
    if (effect.revokeStatus === 'compensating') return 'compensating';
    if (effect.revokeStatus === 'revoked') {
      const localSoftDelete =
        this._classOf(effect) === 'local_compensate' &&
        (this.revoker?.canHandle(effect.resultType) ?? false);
      if (localSoftDelete) {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        if (target && target.deletedAt == null) return null; // 已从回收站恢复 → 又活了 → 不算完成
      }
      return 'already_revoked';
    }
    return null;
  }

  /**
   * 构建「跳过不重复触发」结果（单条撤销用；批量走 _revokeBatch 的 skip 分支）。
   * 争议降级**不在此处**——跳过路径原本以「幂等成功」的口径把争议重新报成完成，故降级由结论层
   * （`_concludeSingle`）统一施加，免得两个判据在这里各判一半。
   */
  private _skippedResult(
    effect: AiToolSideEffect,
    reason: 'already_revoked' | 'compensating',
  ): RevokeResult {
    // 幂等语义（单条）：已撤销 = 终态已达成 → revoked:true（HTTP DELETE 幂等成功），仅 skipped 标记不重复触发；
    // 补偿中 = 外部结果未知 → 如实 revoked:false（KB-6：不得显示为已撤销）。
    const alreadyRevoked = reason === 'already_revoked';
    return {
      revoked: alreadyRevoked,
      effectId: effect.id,
      skipped: true,
      reason,
      external: reason === 'compensating',
      revokeStatus: (effect.revokeStatus as RevokeResult['revokeStatus']) ?? undefined,
      message:
        reason === 'already_revoked'
          ? '该副作用此前已撤销（幂等成功），跳过重复触发'
          : '外部补偿已请求、结果以目标系统为准——跳过重复触发',
    };
  }

  /**
   * 撤销派发（docs/cascade-compensation.spec.md §5）：属**多成员补偿组** → 级联补偿整组；
   * 否则走单目标路径（无组的历史行行为逐字节不变）。
   *
   * 返回的是**逐行事实**（这一条到底撤销了没有）；REV-1 / REV-5 的争议降级由**结论层**施加：
   * 单条撤销在 `_concludeSingle` 里降级，组级在 `_groupResult` 里降级，批量则不动逐条计数
   * —— 否则同一件事（持有的行确实补偿了、声明却不一致）会在两条路径上被数成不同的东西。
   * 跨组闸门（REV-5）在组级由此处算出后传入，撤销过程中**不再**重复查询。
   */
  private async _doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    if (effect.compensationGroup) {
      const members = await this.listGroup(effect.compensationGroup);
      if (members.length > 1) {
        // REV-5：撤销**之前**先看 —— 另一个活组是否也主张本次要撤的这些 effect
        const cross = await this._crossGroupClaims(effect.compensationGroup, members);
        return (await this._compensateGroup(effect, effect.compensationGroup, members, cross)).result;
      }
    }
    return this._doRevokeSingle(effect);
  }

  /**
   * REV-1 / REV-5：**撤销不得报告完成**（这一步才是关键，只暴露不一致/重叠不够）。
   *
   * 只降级结论与说明，**不改写行级运维态**：持有的那几行确实被补偿了（`revokeStatus=revoked` 是真的），
   * 而「这**一次业务动作**是否已完全撤销」为假——被拒声明里多出来的成员没有任何行持有（REV-1），
   * 或另一个活组承载的业务动作不在本次范围内（REV-5）。两个读数由此分轴，
   * 故 `revoked:false` 与 `revokeStatus:'revoked'` 并存是**如实**，不是矛盾。
   */
  private _withDisputeNote(
    effect: AiToolSideEffect,
    result: RevokeResult,
    cross: CrossGroupClaim[] = [],
  ): RevokeResult {
    const notes: string[] = [];
    if (effect.revokeDispute) {
      notes.push(
        '该补偿组已被标记为「声明与持有不一致」：已按**持有**的行补偿，而声明的成员与登记的不一致——不得视为该业务动作已完全撤销',
      );
    }
    if (cross.length) notes.push(this._crossClaimText(cross));
    if (notes.length === 0) return result;
    return {
      ...result,
      revoked: false,
      message: `${result.message ? `${result.message}；` : ''}${notes.join('；')}`,
    };
  }

  /** 撤销能力档位（KB-6）：行上快照优先；旧行/未快照行按工具注册或 resultType 兜底解析 */
  private _classOf(effect: AiToolSideEffect): RevokeClass {
    return (
      (effect.revokeClass as RevokeClass) ??
      this._resolveSnapshotClass(effect.toolName, effect.resultType)
    );
  }

  /**
   * 级联补偿整组：本地成员落在**一个 DB 事务**里，任一失败即回滚 → 整组零改动；
   * 外部成员在本地事务提交后于事务外顺序补偿，诚实落 compensating / revoke_failed。
   * 本地回滚时**不触发**外部补偿——避免制造「半补偿」（一部分已撤销、一部分原样）的更糟状态。
   */
  private async _compensateGroup(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    cross: CrossGroupClaim[],
  ): Promise<{ result: RevokeResult; items: RevokeBatchItem[] }> {
    const results: RevokeBatchItem[] = [];
    const locals: AiToolSideEffect[] = [];
    const externals: AiToolSideEffect[] = [];
    // REV-1 / REV-5：争议是**组级**事实 → 汇总必须据此拒绝报完成，无论本次是否真的补偿了什么。
    const disputeNotes = this._disputeNotes(members, cross);

    for (const m of members) {
      const reason = await this._skipReason(m);
      if (reason) {
        results.push({
          effectId: m.id,
          revoked: false,
          skipped: true,
          reason,
          revokeStatus: (m.revokeStatus as RevokeBatchItem['revokeStatus']) ?? null,
          compensationGroup: groupId,
        });
        continue;
      }
      if (this._classOf(m) === 'local_compensate' && this.revoker?.canHandle(m.resultType)) {
        locals.push(m);
      } else {
        externals.push(m);
      }
    }

    // REV-9：组内本地成员与单条走**同一处**比对——否则「同一状态两条路两个结论」正是本仓反复修的那类缺陷。
    // 在事务**之前**读：软删在事务里发生，读要在那之前。声明在 `if` 之外，因为组级摘要也要用它。
    const driftByEffect = new Map<number, string>();
    if (locals.length) {
      for (const m of locals) {
        const d = await this._targetDrift(m);
        if (d) {
          driftByEffect.set(m.id, d);
          this.logger.warn(
            `[AiToolEffects] effect ${m.id}: 目标 ${m.resultType} #${m.resultId} 在写入后被改过（${d}）`,
          );
        }
      }
      const run = async (manager?: EntityManager): Promise<void> => {
        for (const m of locals) {
          const r = await this.revoker!.revoke(m.resultType, m.resultId, m.userId, manager);
          if (!r.revoked) {
            throw new Error(r.message ?? `本地补偿失败：${m.resultType} #${m.resultId}`);
          }
        }
      };
      try {
        if (this.dataSource) {
          await this.dataSource.transaction((manager) => run(manager));
        } else {
          // 无 DataSource（单测 / 降级装配）：退化为顺序执行，失去原子性。部署态恒有 DataSource。
          await run();
        }
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`[AiToolEffects] cascade rollback (group ${groupId}): ${msg}`);
        for (const m of locals) {
          results.push({ effectId: m.id, revoked: false, error: msg, compensationGroup: groupId });
        }
        for (const m of externals) {
          results.push({
            effectId: m.id,
            revoked: false,
            message: '本地成员补偿失败并已回滚，未触发外部补偿（避免半补偿）',
            compensationGroup: groupId,
          });
        }
        const rolledBack = this._groupResult(requested, groupId, members, results, disputeNotes);
        // 失败也要留痕：审计要看见「补偿尝试过且失败了」，而不是一片空白
        await this._auditCompensation(groupId, members, rolledBack.items, requested);
        return rolledBack;
      }
      // 提交成功后才回写运维态（在事务内回写会在回滚后留下假的 revoked）
      for (const m of locals) {
        await this._patchRevoke(m, { revokeStatus: 'revoked' });
        const driftNote = this._withDriftNote(undefined, driftByEffect.get(m.id) ?? null);
        results.push({
          effectId: m.id,
          revoked: true,
          revokeStatus: 'revoked',
          compensationGroup: groupId,
          // REV-9：漂移事实随该成员逐条可见（组级汇总不吞它）——没有漂移时不加该字段，保持原形状
          ...(driftNote ? { message: driftNote } : {}),
        });
      }
    }

    for (const m of externals) {
      const r = await this._doRevokeSingle(m);
      results.push({
        effectId: m.id,
        revoked: r.revoked,
        // ARC-7：逐条必须带上「没撤销是因为在等目标系统」这一读数——否则它在汇总里既不是 revoked
        // 也不是 skipped，会被 `_groupResult` 计成 failed（一次**成功**的派发被报成**失败**）。
        skipped: r.skipped,
        reason: r.reason === 'already_revoked' || r.reason === 'compensating' ? r.reason : undefined,
        external: r.external,
        revokeStatus: r.revokeStatus ?? null,
        message: r.message,
        compensationGroup: groupId,
      });
    }

    const out = this._groupResult(
      requested,
      groupId,
      members,
      results,
      disputeNotes,
      [...driftByEffect.entries()].map(
        ([id, d]) => `effect ${id} 的目标在写入后被改过（${d}），本次补偿把该改动一并抹除`,
      ),
    );
    await this._auditCompensation(groupId, members, out.items, requested);
    return out;
  }

  /**
   * 补偿自身入 operation_audit（docs/cascade-compensation.spec.md §6）——该表入哈希链，故补偿自动入链。
   *
   * 只对**组级**补偿写显式行：单目标撤销已有全局拦截器行（HTTP 级），再写一行只是噪音；而组级补偿的
   * 逐成员结果只有服务层知道，拦截器看不见。
   * 落点 `targetId` = **根成员的业务 id**（不是副作用 id）→ 使其能被 evidence-root / 业务动作视图按业务对象捞到。
   *
   * 诚实取舍：`OperationAuditService.log()` 两个方言分支都只 logger.warn 吞掉异常、**永不抛**，
   * 故这里是 best-effort，**做不到 fail-closed**（本仓 AU-5 的 fail-closed 抛的是另一条链 / AI 审计）。
   * 但「状态改了却无记录」不会发生：权威运维态是逐条 revoke_status + 目标软删信号，
   * 本行只是链锚定的人读摘要。
   */
  private async _auditCompensation(
    groupId: string,
    members: AiToolSideEffect[],
    items: RevokeBatchItem[],
    requested: AiToolSideEffect,
  ): Promise<void> {
    if (!this.operationAudit) return;
    const byId = new Map(members.map((m) => [m.id, m]));
    const root = members.find((m) => m.parentEffectId == null) ?? members[0];
    const detail = JSON.stringify(
      items.map((it) => {
        const m = byId.get(it.effectId);
        return {
          resultType: m?.resultType ?? null,
          resultId: m?.resultId ?? null,
          role: it.effectId === root.id ? 'root' : 'child',
          revoked: it.revoked,
          revokeStatus: it.revokeStatus ?? null,
        };
      }),
    );
    const uid = Number(requested.userId);
    await this.operationAudit.log({
      userId: Number.isFinite(uid) ? uid : null,
      action: 'COMPENSATE',
      method: 'DELETE',
      path: '/ai/tool-effects/compensate',
      featureKey: 'ai.compensate',
      featureFallback: 'ai · compensate',
      targetId: String(root.resultId),
      requestBody: JSON.stringify({
        groupId,
        requestedEffectId: requested.id,
        total: members.length,
        // REV-12：**指回原始授权决定**。此前这行有组、有成员明细、有 target，唯独没有「这次撤销依据的是
        // 哪次授权」⇒「谁许可 / 执行 / 收回」要靠证据包另行拼装，**行本身**答不出。这里带上授权时那条
        // 链的连接键，使三者可在一条链上读。**不新建第二套授权存储** —— 只指回，不复制。
        //
        // 为什么是这几个键、以及它们各自能指到哪（如实边界）：
        // - `runId`：**run 级确认时它就是那次决定本身的标识**（token = runId，见 run-level-approval.spec.md
        //   §2.3）—— 这是**直接引用**；单条确认/免确认写为 null。
        // - `conversationId` + `toolName`：单条确认唯一可靠的定位键 —— 授权依据（含策略版本）在会话的
        //   `tool_call` 审计行上，按这两个键可定位到它。**不把策略版本复制过来**：撤销时读到的策略版本是
        //   **此刻**的，不是授权时的，抄进来只会把后来的策略写成当时的依据。
        authorization: {
          conversationId: requested.conversationId ?? null,
          runId: requested.runId ?? null,
          toolName: requested.toolName,
        },
      }),
      // changes 是链外列（≤4000）→ 逐成员明细放这里不动 payload 契约；超长截断护栏
      changes: detail.length > 4000 ? `${detail.slice(0, 3997)}...` : detail,
      businessEvent: 'AiSideEffectCompensated',
    });
  }

  /**
   * 组级结果汇总：整组全成（或本就是已撤销态）才 `revoked:true`——
   * 「已请求外部补偿·结果未知」与「有成员失败」都不得伪装成已撤销（KB-6 诚实口径）。
   *
   * 第三个条件：**有争议**（REV-1 声明与持有不一致 / REV-5 另一个活组仍主张）同样不得报完成 ——
   * 持有多出来的那几条没有任何行承载，或那一组的业务动作不在本次范围内，
   * 「这个业务动作已完全撤销」是假的，即便持有的每一行都补偿成功。说明由 `disputeNotes` 原样带出。
   */
  private _groupResult(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    results: RevokeBatchItem[],
    disputeNotes: string[],
    /**
     * REV-9：组内成员的「目标被中间写改过」清单。走**独立车道**——它与 `disputeNotes` 不同：
     * 争议要**拒绝报完成**（`revoked:false`），而漂移只要求**不静默**，不得据此改判定。
     * 默认空：回滚分支调用时什么都没补偿，谈不上抹掉谁的改动。
     */
    driftNotes: string[] = [],
  ): { result: RevokeResult; items: RevokeBatchItem[] } {
    const disputed = disputeNotes.length > 0;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.revoked && !r.skipped).length;
    const alreadyRevoked = results.filter((r) => r.reason === 'already_revoked').length;
    const compensating = results.some(
      (r) => r.reason === 'compensating' || r.revokeStatus === 'compensating',
    );
    const revoked = results.filter((r) => r.revoked).length;
    const allOk = failed === 0 && revoked + alreadyRevoked === results.length;
    const summary =
      failed > 0
        ? `级联补偿失败（${failed}/${members.length} 条未补偿）：本地成员已整体回滚，未产生半补偿状态`
        : disputed
          ? `级联补偿 ${members.length} 条：${disputeNotes.join('；')}`
          : compensating
            ? `级联补偿 ${members.length} 条：本地已完成，外部成员补偿已请求、结果以目标系统为准`
            : `级联补偿 ${members.length} 条（同一次业务动作）`;
    return {
      result: {
        revoked: allOk && !compensating && !disputed,
        effectId: requested.id,
        compensationGroup: groupId,
        cascade: { groupId, total: members.length, revoked, skipped, failed },
        revokeStatus: failed > 0 ? 'revoke_failed' : compensating ? 'compensating' : 'revoked',
        // 逐成员 message 会被这条摘要遮住，故漂移清单在此**并进摘要**（组级读数的可见面就是它）
        message: driftNotes.length > 0 ? `${summary}；${driftNotes.join('；')}` : summary,
      },
      items: results,
    };
  }

  private async _doRevokeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    // KB-6：撤销能力档位门控——none（不可撤/外部未知）直接拒绝，不再误走 externalRevoker
    // 制造"可撤销"假象。旧行 revokeClass 为 null 时按工具/resultType 兜底解析。
    const revokeClass: RevokeClass = this._classOf(effect);
    if (revokeClass === 'none') {
      return {
        revoked: false,
        effectId: effect.id,
        external: effect.resultType === 'proxy_call',
        message: '该副作用无撤销接口（revokeClass=none：不可撤 / 目标系统无补偿端点）',
      };
    }

    // D2-1f：本地实体撤销走 SideEffectRevoker（可替换为远程补偿 revoker）
    if (revokeClass === 'local_compensate' && this.revoker?.canHandle(effect.resultType)) {
      // REV-9：**先**问一句「目标还是不是我写的那条」，再软删——软删之后那行就没了，问也白问。
      const drift = await this._targetDrift(effect);
      const r = await this.revoker.revoke(effect.resultType, effect.resultId, effect.userId);
      this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effect.id})`);
      if (r.revoked) await this._patchRevoke(effect, { revokeStatus: 'revoked' });
      if (drift) {
        this.logger.warn(
          `[AiToolEffects] effect ${effect.id}: 目标 ${effect.resultType} #${effect.resultId} 在写入后被改过（${drift}）`,
        );
      }
      return {
        revoked: r.revoked,
        effectId: effect.id,
        message: this._withDriftNote(r.message, drift),
        revokeStatus: r.revoked ? 'revoked' : 'revoke_failed',
      };
    }
    // governed_external / 本地 canHandle 不中的 proxy_call：B 路径外部补偿
    if (this.externalRevoker) {
      // REV-2 细化：**外呼之前**先写「意图」。这一刻的诚实读数是「**可能根本没到达**外部系统」；
      // 此前是「先外呼、返回后才写态」——进程若在调用中途死掉则一个字段都不写，该行读起来像**从未请求过补偿**，
      // 「当前未了结」的聚合里凭空少一条。「发送前」与「已确认」是两个事件，其间的间隙正是那个真实的不确定。
      //
      // ARC-3：这一次写入同时是**派发认领（CAS）** —— 此前是无条件 `update`（裸 read-modify-write），
      // 两次并发撤销会**各自读到 `revoke_status = null` 然后各派发一次**：退款/取消订单这类端点若非幂等，
      // 那是**真双发**；而且后一次写回的 `revoke_failed` 还会**覆盖**前一次的成功读数。
      // 条件更新是唯一仲裁点（同 `ConfirmationStore.resolve` / `R4ApprovalService._claimExecution` 先例）：
      // 只有仍处「未派发」（NULL）或「上次失败、可重试」（revoke_failed）的行才放行派发；
      // 已被派发（compensating）或已完成（revoked）⇒ 命中 0 行 ⇒ **不派发**，如实回报。
      // 认领落地后，本行在这轮派发里**只有这一个写者**，故上面那条覆盖风险随之一并消失——不需要再给回写加条件。
      //
      // ⚠ 用 `Raw` 写这条谓词，**不要** `In([null, 'revoke_failed'])`：SQL 里 `x IN (NULL, ...)` 对 NULL 恒不成立
      //（要 `IS NULL`），照 `In` 写会让**首次派发**永远认领不到。
      //
      // **fail-closed**：判据取 `!claim?.affected` 而非 `=== 0` —— 底层没给出可判定的 `affected` 时
      //（替身 / 非标准驱动），宁可当作认领失败、不派发，也不把「读数缺失」当成许可。
      // 口径同 `ConfirmationStore.resolve`：拿不到 affected 一律拒。
      const claim = await this.effectsRepo.update(
        {
          id: effect.id,
          revokeStatus: Raw((alias) => `(${alias} IS NULL OR ${alias} = 'revoke_failed')`),
        },
        {
          revokeStatus: 'compensating',
          revokeRequestedAt: new Date(),
          // 上一次请求的确认不代表这一次 —— 重试（revoke_failed 可重试）必须把旧确认清掉，
          // 否则新意图会被旧确认冒充成「已到达」。
          revokeAcknowledgedAt: null,
        },
      );
      if (!claim?.affected) {
        const now = await this.effectsRepo.findOne({ where: { id: effect.id } });
        return {
          revoked: false,
          effectId: effect.id,
          external: true,
          skipped: true,
          reason: 'compensating',
          revokeStatus: (now?.revokeStatus as RevokeResult['revokeStatus']) ?? undefined,
          message: '该副作用的外部补偿已在派发中（或已完成）——本次未重复派发',
        };
      }
      const r = await this.externalRevoker.revoke(effect.toolName, effect.resultId, effect.userId);
      // 外呼返回 = **确认**（对方应答过，含拒绝）：单独记为一个事件，与意图之间留下可读的间隙。
      // KB-6：2xx ≠ 确认回滚——补偿端点 2xx 只证明「已请求」，Java 端结果未知 → 落 compensating 而非 revoked。
      await this._patchRevoke(effect, {
        revokeStatus: r.ok ? 'compensating' : 'revoke_failed',
        revokeAcknowledgedAt: new Date(),
      });
      if (!r.ok) {
        // 对方拒绝 = 补偿**失败**（不是「未完成」）——据实计为失败，**不进 skipped**（两者在汇总里必须分得开）。
        return {
          revoked: false,
          effectId: effect.id,
          external: true,
          compensated: false,
          revokeStatus: 'revoke_failed',
          message: r.message,
        };
      }
      // ARC-2 / ARC-7：**`compensating` 不得报 `revoked`**。KB-6 与本文件组级路径（`_groupResult`）早已如此，
      // 唯独单条外部分支此前用 `revoked: r.ok`——于是同一条 `compensating`、同一状态，单条说「已撤销」而组级说「未完成」。
      // 现在四处同向：不仅 `revoked:false`，还给出与「本就在 compensating 的行」**完全相同**的读数
      // （`skipped` + `reason:'compensating'`），批量的 `revoked` 计数因此不再把待目标系统的成员算成已撤销——
      // 那三个数直接进管理台 toast（`aiCenterConvRevokeDone`）。
      return {
        revoked: false,
        effectId: effect.id,
        external: true,
        compensated: true,
        skipped: true,
        reason: 'compensating',
        revokeStatus: 'compensating',
        message: `Java 端已请求补偿（${r.message}）；结果以目标系统为准`,
      };
    }
    return {
      revoked: false,
      effectId: effect.id,
      external: true,
      message: 'B 路径外部副作用撤销需 Java 端补偿（无本地实体可软删 / 未配置补偿执行器）',
    };
  }

  /**
   * KB-6：回写撤销运维态（不入哈希链 payload）。保存失败静默——显示态以 targetSoftDeleted 为准，此为辅助审计态。
   *
   * REV-1 / REV-2 细化后，**每个事件各自成一个 patch**，不再由一个 setter 顺手补齐时间戳：
   * 意图（外呼前）/ 确认（外呼后）/ 终态（本地补偿成功）/ 争议标记。写什么由调用点显式给出，
   * 好让「哪一刻写了什么」本身就是可读、可断言的事实。
   */
  private async _patchRevoke(
    effect: AiToolSideEffect,
    patch: Partial<
      Pick<
        AiToolSideEffect,
        'revokeStatus' | 'revokeRequestedAt' | 'revokeAcknowledgedAt' | 'revokeDispute'
      >
    >,
  ): Promise<void> {
    try {
      await this.effectsRepo.update(effect.id, patch);
    } catch (err) {
      this.logger.warn(`[AiToolEffects] revoke_status update failed (effect ${effect.id}): ${(err as Error).message}`);
    }
  }

  private async _loadTarget(type: string, id: number): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    // D2-1f：目标状态经 SideEffectRevoker（本地软删状态 / 外部系统占位）
    return (
      this.revoker?.describeTarget(type, id) ?? { title: '外部系统写调用（B 路径）', deletedAt: null }
    );
  }
}

/** 递归按 key 排序对象，保证同一 args 稳定序列化 —— 幂等键、args 摘要与代理身份共用同一口径 */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      obj[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return obj;
  }
  return value;
}
