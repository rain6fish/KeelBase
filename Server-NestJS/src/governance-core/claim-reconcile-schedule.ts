// SPDX-License-Identifier: Apache-2.0

/**
 * F-79: **when may an unanswered write claim be asked again** — the decay schedule, single-sourced.
 *
 * A stuck hold sits in `awaiting_decision` because its outcome is unknown and nobody asked the target
 * again. Asking forever is traffic the target never agreed to; asking once and stopping leaves the row
 * waiting for a person who may never look. This module is the middle: a bounded, decaying number of
 * automatic re-asks, after which the row is explicitly parked and the read surface says so.
 *
 * The per-claim decisions are made here and read by two surfaces (`reconcileDueClaims` on the hourly
 * sweep decides, `WriteClaimQueryService` explains) — so they live in one function, not two:
 *
 * - **How many asks.** `CLAIM_RECONCILE_MAX_ATTEMPTS` (default 4).
 * - **How long to wait before each.** `CLAIM_RECONCILE_BACKOFF_MINUTES` (default `60,360,1440,4320`,
 *   i.e. +1h, +6h, +24h, +72h after the previous ask).
 *
 * A third decision — **how many queries one pass may send** (`CLAIM_RECONCILE_MAX_PER_PASS`, default
 * 25) — is a burst bound across all claims, not a per-row one. It lives here too because it is the same
 * plan read by the same sweep; a per-row cap alone would let a backlog of a hundred due rows send a
 * hundred GETs in one pass.
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
 * - **一趟最多问几条**。`CLAIM_RECONCILE_MAX_PER_PASS`（默认 25）。次数上限界的是「一条行一辈子问几次」，
 *   这一条界的是「一趟里同时打出多少个请求」—— 只有前者时，积压一百条会在一趟里发一百个 GET。
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

/**
 * Queries one hourly pass may send, across all claims. A per-claim attempt cap alone bounds each row's
 * lifetime traffic, not the burst: a backlog of a hundred due rows would send a hundred GETs in one
 * pass. Rows it does not reach stay due and are served next hour, oldest first.
 *
 * 一趟（每小时）最多能发出多少个询问，跨所有占位行合计。只有每条行的次数上限时，界的是「一条行一辈子的
 * 流量」，不是突发：一百条到期的行会在一趟里发一百个 GET。这趟没轮到的行仍然到期，下一趟按最老的先问。
 */
export const DEFAULT_CLAIM_RECONCILE_MAX_PER_PASS = 25;

/**
 * Resolve the per-pass cap. Invalid or missing config falls back to the constant — reading an
 * unreadable value as zero would silently stop all automatic asking, which is not what "unreadable"
 * means.
 *
 * 解析每趟上限。配置缺失或不可用时回落到常量 —— 把不可读的值读成 0，一趟就一条都不问，那会静默停掉
 * 全部自动重问，不是「读不出」的意思。
 */
export function claimReconcilePassCap(configured: unknown): number {
  const value =
    typeof configured === 'number'
      ? configured
      : typeof configured === 'string' && configured.trim() !== ''
        ? Number(configured)
        : NaN;
  return Number.isFinite(value) && value >= 1
    ? Math.trunc(value)
    : DEFAULT_CLAIM_RECONCILE_MAX_PER_PASS;
}

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
