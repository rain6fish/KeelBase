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

export interface WriteToolContext {
  userId: string;
  conversationId?: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** E-1 字段级变更快照（JSON 字符串；create 类 before 为 null） */
export interface SideEffectSnapshot {
  before?: string | null;
  after?: string | null;
}

/** B 路径外部副作用撤销执行器 token（AiModule 提供 ProxyToolRevokerService） */
export const EXTERNAL_REVOKER = 'EXTERNAL_REVOKER';

/** 撤销结果：本地实体 revoked=true（软删）；B 路径外部（proxy_call）external=true（Java 端补偿 / 或诚实语义） */
export type RevokeResult = {
  revoked: boolean;
  effectId: number;
  external?: boolean;
  compensated?: boolean;
  message?: string;
};

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
    // G-3（§22.17 ① G-3）：副作用哈希链（AuditChainService，ai.module 已 import AuditChainModule；缺失降级不链化）
    @Optional() private readonly auditChain?: AuditChainService,
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
      toolName: ctx.toolName,
      argsHash: createHash('sha256').update(JSON.stringify(sortKeys(ctx.args))).digest('hex').slice(0, 16),
      resultType,
      resultId,
      beforeSnapshot: snapshot?.before ?? null,
      afterSnapshot: snapshot?.after ?? null,
    };
    // G-3（§22.17 ① G-3）：新行入副作用哈希链（prev = 最近一条已哈希行；历史行 null 不参与；首个哈希行 genesis）
    let chain: { prevHash: string | null; hash: string } | undefined;
    if (this.auditChain) {
      const prev = await this._lastSideEffectHash();
      chain = { prevHash: prev ?? null, hash: this.auditChain.computeHash(prev, this._chainPayload(base)) };
    }
    // 幂等：并发下可能已插入，命中唯一冲突则跳过
    try {
      const saved = await this.effectsRepo.save(
        this.effectsRepo.create({ ...base, ...(chain ?? {}) } as Partial<AiToolSideEffect>),
      );
      this._reportEffect(ctx, resultType, resultId);
      return saved;
    } catch (err) {
      this.logger.warn(`[AiToolEffects] record conflict (idempotent skip): ${(err as Error).message}`);
      const existing = await this.effectsRepo.findOne({ where: { idempotencyKey: key } });
      this._reportEffect(ctx, resultType, resultId);
      return existing!;
    }
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
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted: target?.deletedAt != null,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
        };
      }),
    );

    return { total, page, limit, items: enriched };
  }

  /**
   * AI Action Center（§22.17 北极星用户侧，docs/ai-action-center.spec.md）：本人 AI 写副作用清单 + 归一状态 + 目标富化。
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
          status: targetSoftDeleted ? 'revoked' : 'executed',
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

  /** §22.16 A-2 业务实体账本：按实体取全部 AI 副作用（时间升序，供行为史聚合） */
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
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt.toISOString(),
          targetExists: !!target,
          targetSoftDeleted: target?.deletedAt != null,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
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

  private async _doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    // D2-1f：本地实体撤销走 SideEffectRevoker（可替换为远程补偿 revoker）
    if (this.revoker?.canHandle(effect.resultType)) {
      const r = await this.revoker.revoke(effect.resultType, effect.resultId, effect.userId);
      this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effect.id})`);
      return { revoked: r.revoked, effectId: effect.id, message: r.message };
    }
    // 非本地（proxy_call）：B 路径外部补偿
    if (this.externalRevoker) {
      const r = await this.externalRevoker.revoke(effect.toolName, effect.resultId, effect.userId);
      return {
        revoked: r.ok,
        effectId: effect.id,
        external: true,
        compensated: r.ok,
        message: r.ok ? `Java 端已补偿（${r.message}）` : r.message,
      };
    }
    return {
      revoked: false,
      effectId: effect.id,
      external: true,
      message: 'B 路径外部副作用撤销需 Java 端补偿（无本地实体可软删）',
    };
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
