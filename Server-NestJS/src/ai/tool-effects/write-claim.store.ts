// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from './ai-write-claim.entity';
import { argsHash, buildKey } from './effect-shared';
import type { WriteToolContext } from './tool-effects.types';

/**
 * ACT-5/6 执行级幂等的**占位行**：执行前认领、执行后落定、失败释放，以及崩溃残留的列出。
 * **从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第四批），实现一字未改 ——
 * 只把 `this._argsHash` 换成共享层的 `argsHash`（它登记与 claims 两簇共用）。
 *
 * The execution-level idempotency placeholders — claim before a write, settle after it, release on
 * failure, list what a crash left behind — moved out of the service as one piece.
 */
export class WriteClaimStore {
  /**
   * ⚠ 日志名**保持搬动前那一份**（`AiToolEffectsService`）而不是改成类名：这次拆分不该让运维看到的
   * 日志前缀变样。用字符串而不是 import 那个类，是为了不引入 `服务 → 本类 → 服务` 的循环。
   *
   * The logger name is deliberately the pre-move one: a split should not change what an operator sees
   * in the logs. A string, not the class, so no service→store→service import cycle appears.
   */
  private readonly logger = new Logger('AiToolEffectsService');

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly claimsRepo?: Repository<AiWriteClaim>,
  ) {}

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

  /**
   * ACT-5/6：为**写工具执行**占位（本地实体写与代理/外部 MCP 写都走它；两条路径的**失败政策不同**，
   * 见 `AiWriteClaim` 头注与 `executeWrite` 的 catch）。唯一约束即仲裁点。
   *
   * 返回 `{ won: true }` = 本次调用拥有这次执行；`{ won: false, status }` = 已有人持有 ⇒ **调用方绝不执行**。
   * `status` 为 `claimed` 时是「正在执行中，或崩溃残留」（两者**当前不可区分**，故一律不重复执行）。
   * `released` = 上一次尝试失败且**确认未落库** ⇒ 这里做一次条件更新重新占位（仍是仲裁，不是无条件覆盖）。
   */
  async claimWrite(
    ctx: WriteToolContext,
  ): Promise<{ won: boolean; status?: string; effectId?: number | null }> {
    // 未装配仓库（单测装配 / 降级接线）⇒ 退回旧行为。**如实标注**：此时写不重复保护**不生效**。
    // 捕获成局部：`this.x` 的窄化会被随后的调用/await 作废（TS 认为方法可能改它）。
    const repo = this.claimsRepo;
    if (!repo) return { won: true };
    const key = buildKey(ctx);
    const now = new Date();
    try {
      await repo.save(
        repo.create({
          idempotencyKey: key,
          userId: ctx.userId,
          // 这三列是 `?: string`（无 `| null`）⇒ 用 `undefined` 表示「无」。TypeORM 的 save 对
          // `undefined` 落 NULL，与直接写 `null` 等价，但不会与「无显式类型的列不允许 TS 写 null」冲突。
          conversationId: ctx.conversationId,
          runId: ctx.runId,
          toolName: ctx.toolName,
          argsHash: argsHash(ctx),
          agentId: ctx.agentId,
          // REV-7：这次写依据的那次授权（确认/审批 token）。缺席 = 没有授权参与（自动写）。
          authorizationRef: ctx.authorizationRef,
          status: WRITE_CLAIM_STATUS.CLAIMED,
          claimedAt: now,
          attempts: 1,
        }),
      );
      return { won: true };
    } catch {
      // 唯一冲突（或写失败）⇒ 读回现状。**fail-closed**：读不到现状也必须返回「不执行」，
      // 绝不因为「没读到证据」就放行一次可能重复的写。
      const existing = await repo.findOne({ where: { idempotencyKey: key } });
      if (!existing) return { won: false, status: 'unreadable' };
      if (existing.status === WRITE_CLAIM_STATUS.RELEASED) {
        const res = await repo.update(
          { id: existing.id, status: WRITE_CLAIM_STATUS.RELEASED },
          {
            status: WRITE_CLAIM_STATUS.CLAIMED,
            claimedAt: now,
            settledAt: null,
            releaseReason: null,
            attempts: existing.attempts + 1,
          },
        );
        if (res?.affected === 0) {
          const again = await repo.findOne({ where: { idempotencyKey: key } });
          return { won: false, status: again?.status ?? 'unreadable', effectId: again?.effectId ?? null };
        }
        return { won: true };
      }
      return { won: false, status: existing.status, effectId: existing.effectId ?? null };
    }
  }

  /** 执行完成且副作用已登记（或本就不登记，如 dry-run）⇒ 落定。`effectId` 为 null 是**如实**，不是缺失。 */
  async settleClaim(key: string, effectId: number | null): Promise<void> {
    if (!this.claimsRepo) return;
    await this.claimsRepo.update(
      { idempotencyKey: key, status: WRITE_CLAIM_STATUS.CLAIMED },
      { status: WRITE_CLAIM_STATUS.SETTLED, settledAt: new Date(), effectId },
    );
  }

  /**
   * **本地实体写**失败 = 事务未提交 ⇒ **确认未落库** ⇒ 释放占位，使重试仍可用（不自造「不可重试」）。
   *
   * ⚠ **外部写不走这里**：它没有「确认未落库」这种证据（请求可能已到达目标），故占位有意留在 `claimed`
   * 待对账 —— 释放它等于允许重试、也就等于邀请一次可能重复的外部写。见 `executeWrite` 的 catch。
   */
  async releaseClaim(key: string, reason: string): Promise<void> {
    if (!this.claimsRepo) return;
    await this.claimsRepo.update(
      { idempotencyKey: key, status: WRITE_CLAIM_STATUS.CLAIMED },
      { status: WRITE_CLAIM_STATUS.RELEASED, releaseReason: reason },
    );
  }

  /**
   * ACT-5（消费者①）：把这次写的**审计行**挂到占位行上 —— 证据根据此配到 effect **自己**那条触发行，
   * 不再在会话里的同名调用之间猜（ACT-2 的「不唯一就不归因」因此有了一条精确支路）。
   *
   * 按**幂等键**定位占位行：调用方手上是工具名与原始参数串（审计行本来就是照它写的），键由同一个
   * `buildKey` 算出，故两处不可能指向不同的行。
   *
   * 找不到占位行（未装配仓储 / 代理写没有占位行 / 本表之前的旧数据）⇒ **静默跳过**；参数串解析不出来
   * 同样跳过 —— 宁可少一条链接，也不挂到错误的行上。挂链失败只告警：它不改任何判定，也不改变证据根
   * 能否回退到保守配对。
   */
  async attachAuditRow(
    ref: { userId: string; conversationId?: string; toolName: string; argsJson: string },
    auditRowId: number,
  ): Promise<void> {
    const repo = this.claimsRepo;
    if (!repo) return;
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(ref.argsJson) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      args = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const key = buildKey({
      userId: ref.userId,
      conversationId: ref.conversationId,
      toolName: ref.toolName,
      args,
    });
    try {
      await repo.update({ idempotencyKey: key }, { auditRowId });
    } catch (err) {
      this.logger.warn(
        `[AiToolEffects] ACT-5 attach audit row failed (key ${key}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 崩溃残留：仍是 `claimed` 且已超过阈值。**可见，但不自动解决** —— 与 REV-11 的认领同一口径：
   * KeelBase 不知道那次执行是否落了库，自动改写状态就是拿猜测冒充事实。
   */
  async listStaleClaims(olderThanMs: number): Promise<AiWriteClaim[]> {
    if (!this.claimsRepo) return [];
    return this.claimsRepo
      .createQueryBuilder('c')
      .where('c.status = :s', { s: WRITE_CLAIM_STATUS.CLAIMED })
      .andWhere('c.claimedAt < :cut', { cut: new Date(Date.now() - olderThanMs) })
      .orderBy('c.claimedAt', 'ASC')
      .getMany();
  }
}
