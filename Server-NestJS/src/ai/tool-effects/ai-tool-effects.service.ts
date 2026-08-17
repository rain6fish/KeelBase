import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface WriteToolContext {
  userId: string;
  conversationId?: string;
  toolName: string;
  args: Record<string, unknown>;
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
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

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

  /** 记录写工具副作用（execute 成功后调用）；resultType: event/todo/crm_task */
  async record(ctx: WriteToolContext, resultType: string, resultId: number): Promise<AiToolSideEffect> {
    const key = AiToolEffectsService.buildKey(ctx);
    // 幂等：并发下可能已插入，命中唯一冲突则跳过
    try {
      const saved = await this.effectsRepo.save(
        this.effectsRepo.create({
          idempotencyKey: key,
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          toolName: ctx.toolName,
          argsHash: createHash('sha256').update(JSON.stringify(sortKeys(ctx.args))).digest('hex').slice(0, 16),
          resultType,
          resultId,
        } as Partial<AiToolSideEffect>),
      );
      return saved;
    } catch (err) {
      this.logger.warn(`[AiToolEffects] record conflict (idempotent skip): ${(err as Error).message}`);
      const existing = await this.effectsRepo.findOne({ where: { idempotencyKey: key } });
      return existing!;
    }
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
        };
      }),
    );

    return { total, page, limit, items: enriched };
  }

  /** 撤销 AI 副作用：软删目标 event/todo/crm_task（可经 RG-3 回收站恢复） */
  async revoke(effectId: number): Promise<{ revoked: boolean; effectId: number } | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect) return null;

    const repo = this.entityManager.getRepository(this._entityFor(effect.resultType));
    const target = await repo.findOne({ where: { id: effect.resultId } } as any);
    if (target) {
      await repo.softDelete(effect.resultId);
    }
    this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effectId})`);
    return { revoked: true, effectId };
  }

  private async _loadTarget(type: string, id: number): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    const repo = this.entityManager.getRepository(this._entityFor(type));
    return (await repo.findOne({
      where: { id },
      withDeleted: true,
      select: { title: true, deletedAt: true },
    } as any)) as any;
  }

  private _entityFor(type: string): string {
    switch (type) {
      case 'event':
        return 'Event';
      case 'crm_task':
        return 'CrmTask';
      case 'pm_task':
        return 'PmTask';
      case 'app_request':
        return 'ApprovalRequest';
      default:
        return 'Todo';
    }
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
