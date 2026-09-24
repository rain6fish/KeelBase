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
import { LessThan } from 'typeorm';
import { revokeAge, DEFAULT_REVOKE_STALE_MINUTES } from './revoke-staleness';

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
  ) {}

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
      this._reportEffect(ctx, effects[0].resultType, effects[0].resultId);
      return existing;
    }
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
  /** B4 治理视图：按业务动作（resultType+resultId，如 crm_task:42）反查 AI 副作用（供「业务动作 → 治理轨迹」展示） */
  async findByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect | null> {
    return this.effectsRepo.findOne({ where: { resultType, resultId } as any });
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
    const reason = this._skipReason(effect);
    if (reason) return this._skippedResult(effect, reason);
    return this._doRevoke(effect);
  }

  /**
   * P0-15 用户侧撤销：仅本人可撤销自己的 AI 副作用。
   * 非本人/不存在 → null（controller 转 404）；目标软删可经 RG-3 回收站恢复。
   */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect || effect.userId !== userId) return null;
    const reason = this._skipReason(effect);
    if (reason) return this._skippedResult(effect, reason);
    return this._doRevoke(effect);
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
    for (const effect of scoped) {
      const groupId = effect.compensationGroup;
      if (groupId) {
        if (processedGroups.has(groupId)) continue;
        processedGroups.add(groupId);
        try {
          const members = await this.listGroup(groupId);
          if (members.length > 1) {
            const { items } = await this._compensateGroup(effect, groupId, members);
            for (const it of items) {
              if (!scopedIds.has(it.effectId)) continue;
              results.push(it);
              if (it.revoked) revoked++;
              else if (it.skipped) skipped++;
              else failed++;
            }
            continue;
          }
        } catch (err) {
          failed++;
          results.push({
            effectId: effect.id,
            revoked: false,
            error: (err as Error).message,
            compensationGroup: groupId,
          });
          continue;
        }
      }
      const skipReason = this._skipReason(effect);
      if (skipReason) {
        skipped++;
        results.push({
          effectId: effect.id,
          revoked: false,
          skipped: true,
          reason: skipReason,
          compensationGroup: groupId ?? null,
        });
        continue;
      }
      try {
        const r = await this._doRevoke(effect);
        if (r.revoked) revoked++;
        else failed++;
        results.push({
          effectId: effect.id,
          revoked: r.revoked,
          revokeStatus: r.revokeStatus ?? null,
          external: r.external ?? false,
          message: r.message,
          compensationGroup: groupId ?? null,
        });
      } catch (err) {
        failed++;
        results.push({
          effectId: effect.id,
          revoked: false,
          error: (err as Error).message,
          compensationGroup: groupId ?? null,
        });
      }
    }
    return { total: scoped.length, revoked, skipped, failed, results };
  }

  /** 撤销跳过判据（单条/批量共用）：已软删 revoked / 已请求外部补偿 compensating；revoke_failed 视为可重试 */
  private _skipReason(effect: AiToolSideEffect): 'already_revoked' | 'compensating' | null {
    if (effect.revokeStatus === 'revoked') return 'already_revoked';
    if (effect.revokeStatus === 'compensating') return 'compensating';
    return null;
  }

  /** 构建「跳过不重复触发」结果（单条撤销用；批量走 _revokeBatch 的 skip 分支） */
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
   */
  private async _doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    if (effect.compensationGroup) {
      const members = await this.listGroup(effect.compensationGroup);
      if (members.length > 1) {
        return (await this._compensateGroup(effect, effect.compensationGroup, members)).result;
      }
    }
    return this._doRevokeSingle(effect);
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
  ): Promise<{ result: RevokeResult; items: RevokeBatchItem[] }> {
    const results: RevokeBatchItem[] = [];
    const locals: AiToolSideEffect[] = [];
    const externals: AiToolSideEffect[] = [];

    for (const m of members) {
      const reason = this._skipReason(m);
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

    if (locals.length) {
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
        const rolledBack = this._groupResult(requested, groupId, members, results);
        // 失败也要留痕：审计要看见「补偿尝试过且失败了」，而不是一片空白
        await this._auditCompensation(groupId, members, rolledBack.items, requested);
        return rolledBack;
      }
      // 提交成功后才回写运维态（在事务内回写会在回滚后留下假的 revoked）
      for (const m of locals) {
        await this._setRevokeStatus(m, 'revoked');
        results.push({
          effectId: m.id,
          revoked: true,
          revokeStatus: 'revoked',
          compensationGroup: groupId,
        });
      }
    }

    for (const m of externals) {
      const r = await this._doRevokeSingle(m);
      results.push({
        effectId: m.id,
        revoked: r.revoked,
        external: r.external,
        revokeStatus: r.revokeStatus ?? null,
        message: r.message,
        compensationGroup: groupId,
      });
    }

    const out = this._groupResult(requested, groupId, members, results);
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
      }),
      // changes 是链外列（≤4000）→ 逐成员明细放这里不动 payload 契约；超长截断护栏
      changes: detail.length > 4000 ? `${detail.slice(0, 3997)}...` : detail,
      businessEvent: 'AiSideEffectCompensated',
    });
  }

  /**
   * 组级结果汇总：整组全成（或本就是已撤销态）才 `revoked:true`——
   * 「已请求外部补偿·结果未知」与「有成员失败」都不得伪装成已撤销（KB-6 诚实口径）。
   */
  private _groupResult(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    results: RevokeBatchItem[],
  ): { result: RevokeResult; items: RevokeBatchItem[] } {
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.revoked && !r.skipped).length;
    const alreadyRevoked = results.filter((r) => r.reason === 'already_revoked').length;
    const compensating = results.some(
      (r) => r.reason === 'compensating' || r.revokeStatus === 'compensating',
    );
    const revoked = results.filter((r) => r.revoked).length;
    const allOk = failed === 0 && revoked + alreadyRevoked === results.length;
    return {
      result: {
        revoked: allOk && !compensating,
        effectId: requested.id,
        compensationGroup: groupId,
        cascade: { groupId, total: members.length, revoked, skipped, failed },
        revokeStatus: failed > 0 ? 'revoke_failed' : compensating ? 'compensating' : 'revoked',
        message:
          failed > 0
            ? `级联补偿失败（${failed}/${members.length} 条未补偿）：本地成员已整体回滚，未产生半补偿状态`
            : compensating
              ? `级联补偿 ${members.length} 条：本地已完成，外部成员补偿已请求、结果以目标系统为准`
              : `级联补偿 ${members.length} 条（同一次业务动作）`,
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
      const r = await this.revoker.revoke(effect.resultType, effect.resultId, effect.userId);
      this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effect.id})`);
      if (r.revoked) await this._setRevokeStatus(effect, 'revoked');
      return { revoked: r.revoked, effectId: effect.id, message: r.message, revokeStatus: r.revoked ? 'revoked' : 'revoke_failed' };
    }
    // governed_external / 本地 canHandle 不中的 proxy_call：B 路径外部补偿
    if (this.externalRevoker) {
      const r = await this.externalRevoker.revoke(effect.toolName, effect.resultId, effect.userId);
      // KB-6：2xx ≠ 确认回滚——补偿端点 2xx 只证明"已请求"，Java 端结果未知 → 落 compensating 而非 revoked
      await this._setRevokeStatus(effect, r.ok ? 'compensating' : 'revoke_failed');
      return {
        revoked: r.ok,
        effectId: effect.id,
        external: true,
        compensated: r.ok,
        revokeStatus: r.ok ? 'compensating' : 'revoke_failed',
        message: r.ok ? `Java 端已请求补偿（${r.message}）；结果以目标系统为准` : r.message,
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
   * KB-6：回写 revoke_status 运维态（不入哈希链 payload）。保存失败静默——显示态以 targetSoftDeleted 为准，此为辅助审计态。
   * REV-2：进入 `compensating` 时一并记下**补偿请求时刻**（重试即更新为最近一次请求），使「挂了多久」可查；
   * 其余状态**不动**该列 —— 它是「最近一次补偿请求」的历史记录，不是当前态的年龄。
   */
  private async _setRevokeStatus(effect: AiToolSideEffect, status: 'revoked' | 'compensating' | 'revoke_failed'): Promise<void> {
    try {
      await this.effectsRepo.update(effect.id, {
        revokeStatus: status,
        ...(status === 'compensating' ? { revokeRequestedAt: new Date() } : {}),
      });
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

/** 递归按 key 排序对象，保证同一 args 稳定序列化 */
function sortKeys(value: unknown): unknown {
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
