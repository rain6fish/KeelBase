// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import type { ExternalRevoker } from '../proxy/proxy-revoker.service';
import { SIDE_EFFECT_REVOKER } from './side-effect-revoker';
import type { SideEffectRevoker } from './side-effect-revoker';
import { GOVERNANCE_REPORTER } from '../governance/governance-reporter.service';
import type { GovernanceReporter } from '../governance/governance-reporter.service';
import type { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass, type RevokeClass } from '../interfaces/tool.interface';

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
};

/** G1 会话级批量撤销：汇总 + 逐条结果 */
export type RevokeBatchResult = {
  conversationId: string;
  total: number;
  revoked: number;
  skipped: number;
  failed: number;
  results: RevokeBatchItem[];
  /** 作用域内超过单次上限被截断（尚有未处理行）——调用方可再次调用续处理（已撤销行会 skip→already_revoked） */
  truncated: boolean;
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
  ) {}

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
      argsHash: createHash('sha256').update(JSON.stringify(sortKeys(ctx.args))).digest('hex').slice(0, 16),
      resultType,
      resultId,
      beforeSnapshot: snapshot?.before ?? null,
      afterSnapshot: snapshot?.after ?? null,
      // KB-6：副作用发生时刻的撤销能力档位快照（ctx 直传优先；否则按工具注册/resultType 兜底）
      revokeClass: ctx.revokeClass ?? this._resolveSnapshotClass(ctx.toolName, resultType),
    };
    // G-3（§internal.17 ① G-3）：新行入副作用哈希链（prev = 最近一条已哈希行；历史行 null 不参与；首个哈希行 genesis）
    let chain: { prevHash: string | null; hash: string } | undefined;
    if (this.auditChain) {
      const prev = await this._lastSideEffectHash();
      chain = { prevHash: prev ?? null, hash: this.auditChain.computeHash(prev, this._chainPayload(base)) };
    }
    // 幂等：并发下可能已插入，命中唯一冲突则跳过（KB-4 FP-4：仅唯一冲突才 skip，DB 错误如实上抛不吞）
    try {
      const saved = await this.effectsRepo.save(
        this.effectsRepo.create({ ...base, ...(chain ?? {}) } as Partial<AiToolSideEffect>),
      );
      this._reportEffect(ctx, resultType, resultId);
      return saved;
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
  }

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
  private async _lastSideEffectHash(): Promise<string | null> {
    const row = await this.effectsRepo
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
  async list(options: { userId?: number; page?: number; limit?: number } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 20, 100);
    const where: Record<string, unknown> = {};
    if (options.userId !== undefined) where.userId = String(options.userId);

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
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
        };
      }),
    );

    return { total, page, limit, items: enriched };
  }

  /**
   * AI Action Center（§internal.17 北极星用户侧，docs/ai-action-center.spec.md）：本人 AI 写副作用清单 + 归一状态 + 目标富化。
   * 数据最小化：不回显 args/argsHash/before/after 快照（字段级证据走 B4/审计面）；人类标签由前端按 toolName 映射（D2 toolLabel）。
   * status 归一：目标软删（targetSoftDeleted=true）→ revoked，否则 executed。
   */
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
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
        };
      }),
    );

    return { total, page, limit, items: enriched };
  }

  /**
   * P0-14：按对话取副作用（含目标记录当前状态），供用户可见的执行轨迹用。
   * 复用 _loadTarget 富化，按 createdAt 升序。
   */
  /** B4 治理视图：按业务动作（resultType+resultId，如 crm_task:42）反查 AI 副作用（供「业务动作 → 治理轨迹」展示） */
  async findByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect | null> {
    return this.effectsRepo.findOne({ where: { resultType, resultId } as any });
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
    return this._doRevoke(effect);
  }

  /**
   * P0-15 用户侧撤销：仅本人可撤销自己的 AI 副作用。
   * 非本人/不存在 → null（controller 转 404）；目标软删可经 RG-3 回收站恢复。
   */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect || effect.userId !== userId) return null;
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
      // 有界加载：多取 1 条探测是否被截断（防一次请求把作用域全部行载入内存 + 串行撤销无界）
      take: AiToolEffectsService.MAX_BATCH + 1,
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
      take: AiToolEffectsService.MAX_BATCH + 1,
    });
    return { runId, ...(await this._revokeBatch(effects, opts)) };
  }

  /** 批量撤销单次处理上限：超出即截断并在结果置 truncated（调用方可分次续，避免无界载入/串行撤销） */
  private static readonly MAX_BATCH = 500;

  /** 批量撤销公共循环（revokeConversation / revokeRun 共用；owner 过滤 + 逐条档位门控 + 汇总 + 截断上报） */
  private async _revokeBatch(
    effects: AiToolSideEffect[],
    opts?: { ownerId?: string },
  ): Promise<{
    total: number;
    revoked: number;
    skipped: number;
    failed: number;
    results: RevokeBatchItem[];
    truncated: boolean;
  }> {
    // 调用方多取 1 条探测截断：> 上限即说明尚有未处理行（如实上报，不静默丢）
    const truncated = effects.length > AiToolEffectsService.MAX_BATCH;
    const capped = truncated ? effects.slice(0, AiToolEffectsService.MAX_BATCH) : effects;
    // 以「未提供」判据而非真值判据：ownerId 为空串等 falsy 值时不得静默升级为 admin 全作用域
    const ownerFilter = opts?.ownerId;
    const scoped =
      ownerFilter !== undefined ? capped.filter((e) => e.userId === ownerFilter) : capped;
    const results: RevokeBatchItem[] = [];
    let revoked = 0;
    let skipped = 0;
    let failed = 0;
    for (const effect of scoped) {
      const skipReason =
        effect.revokeStatus === 'revoked'
          ? 'already_revoked'
          : effect.revokeStatus === 'compensating'
            ? 'compensating'
            : null;
      if (skipReason) {
        skipped++;
        results.push({ effectId: effect.id, revoked: false, skipped: true, reason: skipReason });
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
        });
      } catch (err) {
        failed++;
        results.push({ effectId: effect.id, revoked: false, error: (err as Error).message });
      }
    }
    return { total: scoped.length, revoked, skipped, failed, results, truncated };
  }

  private async _doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    // KB-6：撤销能力档位门控——none（不可撤/外部未知）直接拒绝，不再误走 externalRevoker
    // 制造"可撤销"假象。旧行 revokeClass 为 null 时按工具/resultType 兜底解析。
    const revokeClass: RevokeClass =
      (effect.revokeClass as RevokeClass) ??
      this._resolveSnapshotClass(effect.toolName, effect.resultType);
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

  /** KB-6：回写 revoke_status 运维态（不入哈希链 payload）。保存失败静默——显示态以 targetSoftDeleted 为准，此为辅助审计态。 */
  private async _setRevokeStatus(effect: AiToolSideEffect, status: 'revoked' | 'compensating' | 'revoke_failed'): Promise<void> {
    try {
      await this.effectsRepo.update(effect.id, { revokeStatus: status });
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
