// SPDX-License-Identifier: Apache-2.0

/**
 * F-79: **when may an unanswered write claim be asked again** — the decay schedule, single-sourced.
 *
 * A stuck hold sits in `awaiting_decision` because its outcome is unknown and nobody asked the target
 * again. Asking forever is traffic the target never agreed to; asking once and stopping leaves the row
 * waiting for a person who may never look. This module is the middle: a bounded, decaying number of
 * automatic re-asks, after which the row is explicitly parked and the read surface says so.
 *
 * Two decisions are made here, and both are read by two surfaces (`reconcileDueClaims` on the hourly
 * sweep decides, `WriteClaimQueryService` explains) — so they live in one function, not two:
 *
 * - **How many asks.** `CLAIM_RECONCILE_MAX_ATTEMPTS` (default 4).
 * - **How long to wait before each.** `CLAIM_RECONCILE_BACKOFF_MINUTES` (default `60,360,1440,4320`,
 *   i.e. +1h, +6h, +24h, +72h after the previous ask).
 *
 * The **anchor** is the previous ask when there is one, else `claimed_at` — the only timestamp a claim
 * has before anything has been asked. With the default staleness threshold (60 min) the row enters
 * `awaiting_decision` at `claimed_at + 60 min` and the first automatic ask is due exactly then; a
 * deployment that raises `REVOKE_STALE_MINUTES` simply has the row queue later, and a deployment that
 * lowers it waits longer before the first ask. Neither changes what the schedule means.
 *
 * Attempts are counted from **every recorded lookup row**, whoever asked — an administrator's manual
 * reconcile consumes the budget too. The budget is about how often we ask the *target*, not about
 * which code path did the asking; two counters would let the total be higher than either says.
 *
 * F-79：**一条没得到回音的写占位，隔多久可以再问一次** —— 衰减计划，单源。
 *
 * 卡住的占位停在 `awaiting_decision`，因为结局未知、且没有人再去问过目标。一直问下去，是目标没答应过的
 * 流量；问一次就停，则把行留给一个也许永远不会来看的人。本模块是两者之间：**有界**、**衰减**的自动重问次数，
 * 用完之后行被明确搁置，读面把这件事说出来。
 *
 * 这里做两个决定，且两个面都读它（每小时清扫上的 `reconcileDueClaims` 据此决定，
 * `WriteClaimQueryService` 据此解释）—— 故它们在一个函数里，不是两份：
 *
 * - **问几次**。`CLAIM_RECONCILE_MAX_ATTEMPTS`（默认 4）。
 * - **每次之前等多久**。`CLAIM_RECONCILE_BACKOFF_MINUTES`（默认 `60,360,1440,4320`，即距上一次询问
 *   +1h、+6h、+24h、+72h）。
 *
 * **锚点**是上一次询问；没有过询问时是 `claimed_at` —— 在问过任何一次之前，占位行只有这一个时刻。默认陈旧
 * 阈值（60 分钟）下，行在 `claimed_at + 60 分钟` 进入 `awaiting_decision`，而第一次自动询问恰好在那时到期；
 * 调高 `REVOKE_STALE_MINUTES` 只是让它更晚入队，调低则是等得更久才第一次问。两者都不改变这份计划的含义。
 *
 * 次数按**每一行查询证据**计，不管是谁问的 —— 管理员的人工对账同样消耗预算。预算管的是我们**问目标的次数**，
 * 不是哪条代码路径问的；两个计数器会让总数比任何一个说的都多。
 */

/** Automatic re-asks per claim before it is parked. / 每条占位在搁置前的自动重问次数。 */
export const DEFAULT_CLAIM_RECONCILE_MAX_ATTEMPTS = 4;

/** Minutes to wait before each ask, in order: +1h / +6h / +24h / +72h. / 每次询问前等待的分钟数。 */
export const DEFAULT_CLAIM_RECONCILE_BACKOFF_MINUTES: readonly number[] = [60, 360, 1440, 4320];

export interface ClaimReconcilePlan {
  /** Effective cap — never more than the number of declared intervals (see `claimReconcilePlan`). */
  maxAttempts: number;
  backoffMinutes: number[];
}

/**
 * Resolve the configured plan, falling back to the constants for anything missing or unusable.
 *
 * The interval table is also an upper bound on attempts: a table with three steps paired with
 * `MAX_ATTEMPTS=6` asks three times, never inventing a fourth interval. Configuring a *shorter* table
 * is therefore the way to ask fewer times at the same cadence, and neither knob silently gains a step
 * the other did not declare.
 *
 * 解析配置的计划，缺失或不可用的部分回落到常量。
 *
 * 间隔表同时是次数上限：三步的表配上 `MAX_ATTEMPTS=6`，结果是问三次，绝不凭空造出第四个间隔。故**缩短**表
 * 就是「按同一节奏少问几次」的表达方式；两个旋钮都不会凭自己多出对方没有声明的档位。
 */
export function claimReconcilePlan(
  maxAttemptsConfigured: unknown,
  backoffConfigured: unknown,
): ClaimReconcilePlan {
  const backoffMinutes = parseBackoff(backoffConfigured);
  const declared = typeof maxAttemptsConfigured === 'number' && Number.isFinite(maxAttemptsConfigured)
    ? Math.trunc(maxAttemptsConfigured)
    : typeof maxAttemptsConfigured === 'string' && maxAttemptsConfigured.trim() !== ''
      ? Math.trunc(Number(maxAttemptsConfigured))
      : NaN;
  const wanted =
    Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_CLAIM_RECONCILE_MAX_ATTEMPTS;
  return { maxAttempts: Math.min(wanted, backoffMinutes.length), backoffMinutes };
}

export interface ClaimReconcileSchedule {
  /** Recorded asks so far (manual and automatic alike). / 迄今记录在案的询问次数（人工与自动都算）。 */
  attempts: number;
  maxAttempts: number;
  /** Budget used up — no further automatic ask. / 预算用尽 —— 不再自动问。 */
  stopped: boolean;
  /** When the next automatic ask becomes due; `null` when stopped or undatable. / 下一次自动询问的到期时刻。 */
  nextDueAt: Date | null;
  /** `now` is at or past `nextDueAt`. / 此刻是否已到期。 */
  due: boolean;
}

/**
 * Where a claim stands in the automatic schedule. Pure: the caller supplies the instant, so the sweep
 * and its tests read the same clock.
 *
 * An unreadable `claimedAt` yields `nextDueAt: null, due: false` rather than a guessed time: a row we
 * cannot date is not a row we should start sending traffic about.
 *
 * 一条占位在自动计划里的位置。纯函数：时刻由调用方给，故清扫与它的用例读的是同一个时钟。
 *
 * `claimedAt` 不可读时给 `nextDueAt: null, due: false`，而不是猜一个时刻：一条连时间都读不出来的行，不该是
 * 我们开始发流量的对象。
 */
export function claimReconcileSchedule(
  claimedAt: Date,
  lastLookupAt: Date | null,
  attempts: number,
  plan: ClaimReconcilePlan,
  now: Date,
): ClaimReconcileSchedule {
  const asked = Number.isFinite(attempts) && attempts > 0 ? Math.trunc(attempts) : 0;
  if (asked >= plan.maxAttempts) {
    return { attempts: asked, maxAttempts: plan.maxAttempts, stopped: true, nextDueAt: null, due: false };
  }
  const anchor = lastLookupAt ?? claimedAt;
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    return { attempts: asked, maxAttempts: plan.maxAttempts, stopped: false, nextDueAt: null, due: false };
  }
  const waitMinutes = plan.backoffMinutes[asked];
  const nextDueAt = new Date(anchor.getTime() + waitMinutes * 60_000);
  return {
    attempts: asked,
    maxAttempts: plan.maxAttempts,
    stopped: false,
    nextDueAt,
    due: now.getTime() >= nextDueAt.getTime(),
  };
}

/** `'60, 360,1440'` (or an already-split array) → positive whole minutes; empty ⇒ the default table. */
function parseBackoff(configured: unknown): number[] {
  const raw =
    typeof configured === 'number'
      ? [configured]
      : typeof configured === 'string'
        ? configured.split(',').map((s) => Number(s.trim()))
        : Array.isArray(configured)
          ? configured.map((v) => Number(v))
          : [];
  const minutes = raw.filter((m) => Number.isFinite(m) && m > 0).map((m) => Math.trunc(m));
  return minutes.length > 0 ? minutes : [...DEFAULT_CLAIM_RECONCILE_BACKOFF_MINUTES];
}
