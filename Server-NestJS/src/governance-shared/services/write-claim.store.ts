// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { AiAuditLog } from '../../governance-shared/entities/ai-audit-log.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
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
    /**
     * AW-11: the connection used to write the audit row's forward edge (`write_claim_id`) in the
     * **same transaction** as the claim's `audit_row_id`. Absent (hand-built test assemblies) ⇒ the
     * claim side is still written exactly as before, and the audit side is skipped rather than
     * written non-atomically.
     *
     * AW-11：用于把审计行的正向边（`write_claim_id`）与占位行的 `audit_row_id` 写在**同一事务**里的连接。
     * 缺席（手工装配的单测）⇒ 占位侧仍按原样写，审计侧则跳过 —— 而不是非原子地只写一半。
     */
    private readonly dataSource?: DataSource,
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
          // AW-15: freeze the decision basis on the row — which role and which policy revision let
          // this through. Unresolved stays `null` (readers say `unknown`), never a guessed value.
          // AW-15：把判定依据钉在行上 —— 哪个角色、哪一版策略放行的。解析不出来就留 `null`
          //（读侧报 `unknown`），绝不填猜测值。
          decidedRole: ctx.decidedRole ?? null,
          policyRevision: ctx.policyRevision ?? null,
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
        // A re-claim that carries a new authorization replaces the ref on the same conditional
        // update, so the claim points at the attempt that actually executed — that ref is the only
        // precise key the explanation surface has for "who approved this". An absent ref leaves the
        // stored value alone: on a retry it means "this caller did not supply one", not "there was
        // no authorization".
        //
        // 带新授权的重占位在同一条条件更新上替换引用，使占位行指向**实际执行**的那次尝试 —— 解释面要说
        // 「谁批准了这次」只能靠这个键。未提供引用则保留原值：重试时它只表示「这个调用方没有提供」，
        // 不表示「没有授权」。
        const res = await repo.update(
          { id: existing.id, status: WRITE_CLAIM_STATUS.RELEASED },
          {
            status: WRITE_CLAIM_STATUS.CLAIMED,
            claimedAt: now,
            settledAt: null,
            releaseReason: null,
            attempts: existing.attempts + 1,
            ...(ctx.authorizationRef ? { authorizationRef: ctx.authorizationRef } : {}),
            // AW-15: the row describes the **latest attempt**, so a re-claim replaces the basis even
            // when it could not be resolved (then `null`, which reads as `unknown`). Keeping the
            // previous attempt's role would attribute this execution to a grant it never used.
            // AW-15：本行描述的是**最近一次尝试**，故重占位一律替换依据 —— 即使解析不出来也替换成
            // `null`（读作 `unknown`）。保留上一次的角色会把本次执行归到它从未使用过的授予上。
            decidedRole: ctx.decidedRole ?? null,
            policyRevision: ctx.policyRevision ?? null,
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
   * AW-17: converge a claim that the target says **has** (or has not) executed.
   *
   * A conditional update, like every other arbitration point here: only a row that is *still* `claimed`
   * moves, so a process that settles the same claim concurrently wins and this call reports `false`
   * rather than overwriting a real result with a query's reading. The store records the outcome; it
   * does not decide it — the conclusion comes from the target, and only a real answer gets here.
   *
   * `executed` → `settled` with `effectId` left `null`: the write happened, but the ledger has no
   * side-effect row for it (the anchor is written only when the original call succeeded, and we do not
   * know the target's id — inventing one would point a future revoke at the wrong record).
   * `not_executed` → `released`, the same door a confirmed local failure uses: a retry is then
   * allowed, because the target itself said nothing ran.
   *
   * @returns whether the row moved. `false` = someone else got there first (or the repository is absent).
   *
   * AW-17：把一条「目标说执行过 / 说没执行」的占位行收敛掉。
   *
   * 条件更新，与本仓其他每个仲裁点同形：只有**仍是** `claimed` 的行会动，故并发落定同一条的那个进程
   * 占先时本次返回 `false`，而不是拿一次查询的读数覆盖一个真实结果。store 只记录结局、不决定结局
   * —— 结论来自目标，且只有**真答案**会走到这里。
   *
   * `executed` → `settled`，`effectId` 留 `null`：写确实发生了，但账上没有它的副作用行（锚行只在原来那次
   * 调用成功时写，而目标侧 id 我们并不知道 —— 编一个会让将来的撤销指错记录）。
   * `not_executed` → `released`，与本地确认失败走同一道门：此后允许重试，因为是目标自己说没跑。
   *
   * @returns 这行是否真的动了。`false` = 别人先到了（或仓储缺席）。
   */
  async reconcileClaim(
    claim: Pick<AiWriteClaim, 'id'>,
    conclusion: 'executed' | 'not_executed',
  ): Promise<boolean> {
    const repo = this.claimsRepo;
    if (!repo) return false;
    const res =
      conclusion === 'executed'
        ? await repo.update(
            { id: claim.id, status: WRITE_CLAIM_STATUS.CLAIMED },
            { status: WRITE_CLAIM_STATUS.SETTLED, settledAt: new Date() },
          )
        : await repo.update(
            { id: claim.id, status: WRITE_CLAIM_STATUS.CLAIMED },
            { status: WRITE_CLAIM_STATUS.RELEASED, releaseReason: 'target_status_not_executed' },
          );
    return (res?.affected ?? 0) > 0;
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
    // AW-11: write both sides of the pair — the claim's `audit_row_id` and the audit row's
    // `write_claim_id` — in one transaction, so a reader can walk forward from the audit row and a
    // failure leaves both sides untouched. Without a claim there is nothing to link: we return
    // without writing the audit side, and a missing audit row rolls the claim side back.
    //
    // AW-11：一次事务写这对引用的两侧 —— 占位行的 `audit_row_id` 与审计行的 `write_claim_id` ——
    // 使读者能从审计行正向走，且失败时两侧都不落。没有占位行就没有可链之处：不写审计侧即返回；
    // 审计行不存在则把占位侧一并回滚。
    try {
      if (this.dataSource) {
        await this.dataSource.transaction(async (manager) => {
          const claimRepo = manager.getRepository(AiWriteClaim);
          const auditRepo = manager.getRepository(AiAuditLog);
          const claim = await claimRepo.findOne({ where: { idempotencyKey: key } });
          // No claim (degraded wiring / proxy write / pre-claim rows) ⇒ silently skip, as before.
          // 没有占位行（降级接线 / 代理写 / 占位表之前的数据）⇒ 如旧静默跳过。
          if (!claim) return;
          const claimWrite = await claimRepo.update({ id: claim.id }, { auditRowId });
          if (!claimWrite.affected) return;
          const auditWrite = await auditRepo.update({ id: auditRowId }, { writeClaimId: claim.id });
          if (!auditWrite.affected) {
            // Throw inside the transaction so the claim side is rolled back as well.
            // 在事务内抛出，使占位侧也一并回滚。
            throw new Error(`audit row ${auditRowId} not found`);
          }
        });
      } else {
        // Degraded assembly: no connection for an atomic pair, so keep the pre-AW-11 behaviour
        // (claim side only) rather than writing a one-sided audit edge.
        // 降级装配：没有可做原子成对的连接，故保留 AW-11 之前的行为（只写占位侧），
        // 而不是写一条单边的审计边。
        await repo.update({ idempotencyKey: key }, { auditRowId });
      }
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
