// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { staleThresholdMinutes } from '../../governance-core/revoke-staleness';
import { AuditService } from './audit.service';

/**
 * AW-16 F-63/F-64: the write side of the governance workflow around a stuck hold.
 *
 * The read side (`WriteClaimQueryService`) states what the table says and never changes it. This
 * service is the only place that moves `decision_state`, and it moves it in exactly two ways:
 *
 * 1. **Expiry** (`sweepOverdue`) — the in-flight window ended. The row enters the pending-decision
 *    queue. `status` is untouched, so the row is still `claimed` and the truth is still unknown. No
 *    audit row: an automatic age transition is not a decision, and writing one hourly would say more
 *    than happened. This is also why expiry can never be read as a release: `released` means
 *    "confirmed not stored", and nothing here has that evidence.
 *
 * 2. **Release** (`release`) — a human closes the handling. The row becomes `closed_unknown`,
 *    `status` stays `claimed`, and the claim's key stays occupied. That is what "release is not
 *    permission to silently retry" means at the arbitration point: `claimWrite` sees `claimed` and
 *    refuses. Evidence (a written note, optionally an external reference) is required, and the act
 *    itself is one chained AI-audit row — no parallel ledger.
 *
 * Both paths are **conditional updates**: a concurrent settle, reconcile or release wins and this
 * service reports the current state instead of overwriting a real result.
 *
 * AW-16 F-63/F-64：滞留占位治理流程的**写侧**。
 *
 * 读侧（`WriteClaimQueryService`）只陈述表里写着什么、从不改它。本服务是唯一移动 `decision_state`
 * 的地方，且只以两种方式移动：
 *
 * 1. **到期**（`sweepOverdue`）—— 在途窗口结束，行进入待裁队列。`status` 一字不动，故行仍是
 *    `claimed`、真相仍未知。**不写审计行**：按年龄自动转换不是一次决定，每小时写一条会说得比发生的多。
 *    这也是到期永远不能被读成释放的原因：`released` 意为「确认未落库」，而这里没有任何这种证据。
 *
 * 2. **释放**（`release`）—— 人关闭处理。行转为 `closed_unknown`，`status` 仍是 `claimed`，占位的键
 *    仍被占住。这就是「释放不等于允许静默重试」在仲裁点的含义：`claimWrite` 看到 `claimed` 就拒绝。
 *    释放须附证据（书面说明，可选外部引用），动作本身写**一条**带链的 AI 审计行 —— 不新造平行账本。
 *
 * 两条路径都是**条件更新**：并发的落定 / 对账 / 释放占先时，本服务如实报当前状态，而不覆盖真实结果。
 */
@Injectable()
export class WriteClaimDecisionService {
  constructor(
    @InjectRepository(AiWriteClaim) private readonly claimsRepo: Repository<AiWriteClaim>,
    private readonly auditService: AuditService,
    // Optional like every other threshold reader: a hand-built assembly falls back to the Joi default.
    // 与其他阈值读取处一样是可选的：手工装配的场合回落到 Joi 默认值。
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * F-64: move every `claimed` + `open` row whose window has ended into the pending-decision queue.
   *
   * `claimed_at < cut` uses the same threshold as `stale` / `listStaleClaims` — one ruler for the
   * whole screen. A row already in the queue, already closed, or no longer `claimed` is left alone.
   *
   * F-64：把每一行「仍 claimed + open 且窗口已结束」的占位移入待裁队列。
   *
   * `claimed_at < cut` 与 `stale` / `listStaleClaims` 用同一阈值 —— 整块屏只用一把尺子。已在队列、
   * 已关闭、或不再是 `claimed` 的行不动。
   */
  async sweepOverdue(
    thresholdMinutesOverride?: number,
  ): Promise<{ moved: number; thresholdMinutes: number }> {
    const thresholdMinutes =
      thresholdMinutesOverride ??
      staleThresholdMinutes(this.configService?.get<number>('REVOKE_STALE_MINUTES'));
    const cut = new Date(Date.now() - thresholdMinutes * 60_000);
    const res = await this.claimsRepo
      .createQueryBuilder()
      .update(AiWriteClaim)
      .set({ decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION })
      .where('status = :status', { status: WRITE_CLAIM_STATUS.CLAIMED })
      .andWhere('decision_state = :open', { open: WRITE_CLAIM_DECISION_STATE.OPEN })
      .andWhere('claimed_at < :cut', { cut })
      .execute();
    return { moved: res.affected ?? 0, thresholdMinutes };
  }

  /**
   * F-63: release a stuck hold, with evidence, and record the act once.
   *
   * Refusals are reported by kind rather than as one `false`, because they mean different things to
   * the person working the queue: `not_found` (no such row), `not_claimable` (already settled or
   * released by the execution path), `not_stale` (still inside its window — nothing to release yet),
   * `already_closed` (a previous release already closed it; no second audit row is written).
   *
   * F-63：释放滞留占位，附证据，并把这次动作记录一次。
   *
   * 拒绝按种类报出，而不是一个 `false` —— 对处理队列的人而言它们含义不同：`not_found`（没有这一行）、
   * `not_claimable`（执行路径已落定或已释放）、`not_stale`（仍在窗口内，还谈不上释放）、
   * `already_closed`（此前已释放；不再写第二条审计行）。
   */
  async release(
    claimId: number,
    actor: { userId: string; username?: string },
    input: ReleaseClaimInput,
  ): Promise<ReleaseClaimResult> {
    const claim = await this.claimsRepo.findOne({ where: { id: claimId } });
    if (!claim) {
      return { outcome: 'not_found', claimId, toolName: null, status: null, decisionState: null, auditRowId: null };
    }

    const thresholdMinutes = staleThresholdMinutes(
      this.configService?.get<number>('REVOKE_STALE_MINUTES'),
    );
    const cutoff = Date.now() - thresholdMinutes * 60_000;

    if (claim.status !== WRITE_CLAIM_STATUS.CLAIMED) {
      return this.refusal('not_claimable', claim);
    }
    if (claim.decisionState === WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN) {
      return this.refusal('already_closed', claim);
    }
    if (claim.claimedAt.getTime() > cutoff) {
      return this.refusal('not_stale', claim);
    }

    // Conditional on both the status and the handling state: a concurrent settle/reconcile wins this
    // write, and we report what actually happened rather than stamping over it.
    // 同时以状态与处置状态为条件：并发的落定 / 对账赢下这次写，我们如实报出实际发生的事，而不是盖掉它。
    const res = await this.claimsRepo.update(
      {
        id: claim.id,
        status: WRITE_CLAIM_STATUS.CLAIMED,
        decisionState: In([
          WRITE_CLAIM_DECISION_STATE.OPEN,
          WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
        ]),
      },
      {
        decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
        releaseReason: 'manual_release_unknown',
      },
    );
    if ((res.affected ?? 0) === 0) {
      const after = await this.claimsRepo.findOne({ where: { id: claim.id } });
      return after
        ? this.refusal(
            after.decisionState === WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN
              ? 'already_closed'
              : 'not_claimable',
            after,
          )
        : this.refusal('not_found', claim);
    }

    // The act itself is the record. Awaited, and a failure is reported rather than swallowed: the
    // state change already happened, and pretending it was silent would be the worse lie.
    // 动作本身即记录。await 且不吞失败：状态已经改了，假装它没发生过是更糟的谎言。
    const audit = await this.auditService.log({
      userId: actor.userId,
      username: actor.username,
      action: 'claim_release',
      // The tool this hold belongs to — so the row can be filtered by tool without parsing `detail`.
      // 这份占位所属的工具 —— 于是按工具筛选不必解析 `detail`。
      tool: claim.toolName,
      // No `outcome`: this row is not a tool verdict, and the conclusion deliberately stays unknown.
      // 不传 `outcome`：这一行不是工具结局，而结论有意保持未知。
      detail: this._detail(claim, input),
      source: 'claim_release',
    });

    return {
      outcome: 'released_unknown',
      claimId: claim.id,
      toolName: claim.toolName,
      status: WRITE_CLAIM_STATUS.CLAIMED,
      decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
      auditRowId: audit.id,
    };
  }

  private refusal(
    outcome: Exclude<ReleaseClaimOutcome, 'released_unknown'>,
    claim: AiWriteClaim,
  ): ReleaseClaimResult {
    return {
      outcome,
      claimId: claim.id,
      toolName: claim.toolName,
      status: claim.status,
      decisionState: claim.decisionState ?? null,
      auditRowId: null,
    };
  }

  private _detail(claim: AiWriteClaim, input: ReleaseClaimInput): string {
    const evidence = input.evidenceRef ? `; evidence: ${input.evidenceRef}` : '';
    return `release write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) → closed_unknown; note: ${input.note}${evidence}`;
  }
}

export interface ReleaseClaimInput {
  /** Why the hold is being released — required, recorded verbatim on the audit row. / 为何释放，必填，原样记入审计行。 */
  note: string;
  /** Optional external reference (ticket, lookup id, log URL). / 可选外部引用（工单、对账 id、日志地址）。 */
  evidenceRef?: string;
}

export type ReleaseClaimOutcome =
  | 'released_unknown'
  | 'not_found'
  | 'not_claimable'
  | 'not_stale'
  | 'already_closed';

export interface ReleaseClaimResult {
  outcome: ReleaseClaimOutcome;
  claimId: number;
  toolName: string | null;
  /** The claim's execution status **after** the call — `claimed` for a release (the truth is unknown). */
  status: string | null;
  decisionState: string | null;
  /** The AI-audit row that records the act; `null` when the call was refused. / 记录本次动作的 AI 审计行；被拒时为 null。 */
  auditRowId: number | null;
}
