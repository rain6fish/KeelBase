// SPDX-License-Identifier: Apache-2.0

/**
 * R-5 / F-109 / F-111: **two clocks for one stuck hold** — when the latest reading went stale, and
 * how long the decision has been pending.
 *
 * One age was doing both jobs. The pending-decision queue was driven by claim age alone, so "the
 * latest reading is old, ask the target again" and "the decision has been open too long, a person
 * must decide" looked identical there. They are different questions, and they route to different
 * people: the first sends a read-only query, the second sends a human.
 *
 * The rule the reader set, and the shape of this module: **the unknown clock never releases
 * anything.** Neither expiry is an outcome — freshness expiry only permits another ask, decision
 * expiry only escalates to a person. A release still needs the target's explicit `not_executed`, or
 * a recorded decision at the claim deadline. There is deliberately no `release` value in
 * `ClaimEscalation`: the rule is a type, not a comment.
 *
 * **Decision age is the stable key.** It is measured from the instant the in-flight window closed
 * (`claimedAt + REVOKE_STALE_MINUTES`), a fixed offset from the claim time. A re-ask moves the
 * freshness clock and never this one, so re-asking cannot reorder the queue; the decision clock
 * stops moving only when a decision is recorded (a closed hold is no longer pending).
 *
 * **Freshness owns no schedule here.** It is the F-79 reconcile schedule's `nextDueAt` read at this
 * instant: stale simply means "the plan allows another ask and that moment has passed". There stays
 * one ruler for "when may we ask again" (`claim-reconcile-schedule.ts`), and this module does not
 * grow a second one.
 *
 * R-5 / F-109 / F-111：**一条卡住的占位上跑着两只钟** —— 最新读数何时变陈旧，以及决策已经悬了多久。
 *
 * 此前一个年龄在干两件事。待裁队列只由占位年龄驱动，于是「最新读数旧了，再问目标一次」与「决策开放太久，
 * 该由人裁」在队列里长得一模一样。它们是两个问题，也通向两种人：前者发一次只读查询，后者交给人。
 *
 * 读者定下的规则，也是本模块的形状：**未知时钟永不释放任何东西**。两只钟的到期都不是结论 —— 新鲜度到期
 * 只允许再问一次，决策到期只升级到人。释放仍须目标的明确 `not_executed`，或占位到期时记录在案的裁决。
 * `ClaimEscalation` 有意不含 `release` 取值：这条规则是类型，不是注释。
 *
 * **决策年龄是稳定键**。它从在途窗口关闭的那一刻起算（`claimedAt + REVOKE_STALE_MINUTES`），是占位时刻
 * 的固定偏移。重问只移动新鲜度那只钟、绝不移动这只，故再问不会重排队列；决策钟只在记录裁决时停下
 *（已关闭的占位不再待裁）。
 *
 * **新鲜度在这里不拥有排期**。它就是 F-79 对账计划的 `nextDueAt` 在这一刻的读数：陈旧只意味着「计划允许
 * 再问、而那个时刻已经过了」。 「何时可以再问」始终只有一把尺子（`claim-reconcile-schedule.ts`），
 * 本模块不再长出第二把。
 */

/**
 * R-5: how long a hold may await a human decision before the queue escalates it to a person, in
 * minutes. A full day by default: automatic re-asks continue on their own schedule, so the bound is
 * about **attention**, not about traffic — after a day, a decision that is still open needs a human
 * even if the target keeps answering `unknown`.
 *
 * R-5：一条占位等人裁决多久之后，队列把它升级到人（分钟）。默认一整天：自动重问按它自己的计划继续，
 * 故这个上限管的是**注意力**，不是流量 —— 一天之后仍在开放的决策需要一个人，即便目标一直答 `unknown`。
 */
export const DEFAULT_CLAIM_DECISION_BOUND_MINUTES = 1440;

/**
 * Resolve the decision bound. Missing or unusable values fall back to the constant — reading an
 * unreadable value as zero would mark every queued row overdue and turn the bound into noise.
 *
 * 解析决策上限。缺失或不可用的值回落到常量 —— 把读不出的值读成 0 会让每条排队行都「超期」，
 * 把上限变成噪音。
 */
export function claimDecisionBoundMinutes(configured: unknown): number {
  const value =
    typeof configured === 'number'
      ? configured
      : typeof configured === 'string' && configured.trim() !== ''
        ? Number(configured)
        : NaN;
  return Number.isFinite(value) && value >= 1
    ? Math.trunc(value)
    : DEFAULT_CLAIM_DECISION_BOUND_MINUTES;
}

/**
 * R-5: where a queued hold is being pushed — toward the target (ask again) or toward a person
 * (decide). Never toward a release: an unknown clock cannot conclude anything.
 *
 * R-5：一条排队的占位正被推向哪边 —— 推向目标（再问一次）还是推向人（裁决）。绝不推向释放：
 * 未知时钟得不出任何结论。
 */
export type ClaimEscalation = 'reask' | 'person';

export interface ClaimClockInput {
  /** Whether the row sits in the pending-decision queue. / 该行是否在待裁队列里。 */
  pendingDecision: boolean;
  /** When the write was claimed. / 写占位的时刻。 */
  claimedAt: Date;
  /** The in-flight window (`REVOKE_STALE_MINUTES`), in minutes. / 在途窗口长度（分钟）。 */
  windowMinutes: number;
  /**
   * When the reconcile plan allows the next automatic ask, or `null` when there is none (target not
   * askable, budget used up, or the row is not queued). This is the freshness clock's expiry.
   *
   * 对账计划允许下一次自动询问的时刻；没有则为 `null`（目标问不了、预算用尽，或行未入队）。
   * 这就是新鲜度那只钟的到期时刻。
   */
  freshnessDueAt: Date | null;
  /** `CLAIM_DECISION_BOUND_MINUTES`. / 决策上限（分钟）。 */
  decisionBoundMinutes: number;
  /** The instant everything is read at; supplied by the caller so tests read the same clock. / 读取时刻。 */
  now: Date;
}

export interface ClaimClocks {
  /**
   * The latest reading is older than the point where asking again became allowed. This is a
   * **permission to re-ask**, not a verdict and not a release.
   *
   * 最新读数已经越过了「允许再问」的时刻。这是**再问的许可**，不是判决，更不是释放。
   */
  readingStale: boolean;
  /** When the reading went stale (the plan's due moment), or `null` when nothing is due. / 读数从何时起陈旧。 */
  readingStaleSince: Date | null;
  /** When the decision came to be pending — the moment the in-flight window closed. / 决策从何时起待裁。 */
  decisionPendingSince: Date | null;
  /** Whole minutes the decision has been pending; `null` when not pending. / 决策已悬的整分钟数。 */
  decisionAgeMinutes: number | null;
  /** The decision clock has passed `decisionBoundMinutes`. / 决策年龄已超过上限。 */
  decisionOverdue: boolean;
  /** The one next step this row calls for; `null` when neither clock has expired. / 该行需要的下一步。 */
  escalation: ClaimEscalation | null;
}

/**
 * Read both clocks at `now`. Pure: the caller supplies the instant and the schedule's due moment, so
 * the read surface and its tests cannot disagree about what "stale" means.
 *
 * Precedence: when both clocks have expired the row escalates to **a person**. The automatic sweep
 * will re-ask on its own the moment the plan allows it; what a person must handle is that the
 * decision itself is overdue. Freshness therefore only becomes the escalation when the decision
 * clock has not run out.
 *
 * 在 `now` 读两只钟。纯函数：时刻与计划的到期时刻都由调用方给，故读面与它的用例不会对「陈旧是什么意思」
 * 各说各话。
 *
 * 优先级：两只钟都到期时升级到**人**。自动清扫会在计划允许时自己再问；需要人处理的是「决策本身已超期」。
 * 故只有当决策钟尚未走完时，新鲜度才成为升级项。
 */
export function claimClocks(input: ClaimClockInput): ClaimClocks {
  const { pendingDecision, claimedAt, windowMinutes, freshnessDueAt, decisionBoundMinutes, now } = input;
  const none: ClaimClocks = {
    readingStale: false,
    readingStaleSince: null,
    decisionPendingSince: null,
    decisionAgeMinutes: null,
    decisionOverdue: false,
    escalation: null,
  };
  if (!pendingDecision) return none;
  if (!(claimedAt instanceof Date) || Number.isNaN(claimedAt.getTime())) return none;
  if (Number.isNaN(now.getTime())) return none;

  const due = freshnessDueAt;
  const readingStale = due instanceof Date && !Number.isNaN(due.getTime()) && now.getTime() >= due.getTime();

  const since = new Date(claimedAt.getTime() + windowMinutes * 60_000);
  const decisionAgeMinutes = Math.max(
    0,
    Math.floor((now.getTime() - since.getTime()) / 60_000),
  );
  const decisionOverdue = decisionAgeMinutes >= decisionBoundMinutes;

  return {
    readingStale,
    readingStaleSince: readingStale ? due : null,
    decisionPendingSince: since,
    decisionAgeMinutes,
    decisionOverdue,
    escalation: decisionOverdue ? 'person' : readingStale ? 'reask' : null,
  };
}
