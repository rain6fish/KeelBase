// SPDX-License-Identifier: Apache-2.0

/**
 * REV-2：`compensating` 的**年龄与陈旧判据**——单源。
 *
 * 背景：`revoke_status='compensating'` 意为「已请求外部补偿、结果未知」。在引入
 * `revoke_requested_at` 之前，这一状态没有任何时间信息，于是「当前未了结」的聚合里，
 * 上个月卡住的行与五分钟前刚请求的行读数完全相同——逐行诚实，聚合不诚实。
 *
 * **边界（不得越线）**：这里只回答「多久了 / 可能已陈旧」。真值仍在目标系统，
 * **不得**据此把状态改写成成功或失败（否则就是把猜测伪装成事实，正是本切片要消除的东西）。
 */

/** 陈旧阈值（分钟）。可由 `REVOKE_STALE_MINUTES` 覆盖。 */
export const DEFAULT_REVOKE_STALE_MINUTES = 60;

export interface RevokeAge {
  /** 该行是否处于「已请求外部补偿·结果未知」这一未了结态。 */
  pending: boolean;
  /** 自补偿请求起经过的分钟数；**非 pending 或请求时刻缺失时为 null**（不谎报 0）。 */
  ageMinutes: number | null;
  /** 已超过阈值。仅当 pending 且年龄已知时才可能为 true。 */
  stale: boolean;
}

/**
 * 判读一行 `revoke_status` / `revoke_requested_at` 的年龄与陈旧度。
 *
 * 两处刻意的「不知道就说不知道」：
 * - **引入本列之前写入的 `compensating` 行**没有请求时刻 → `pending:true`、`ageMinutes:null`、
 *   `stale:false`。它们确实未了结，但年龄不可知，故既不谎报 0 分钟，也不凭猜测判陈旧。
 * - `ageMinutes` 下限取 0：时钟回拨或写入与服务端存在偏移时，不给出负数年龄。
 */
export function revokeAge(
  revokeStatus: string | null | undefined,
  revokeRequestedAt: Date | string | null | undefined,
  now: Date,
  thresholdMinutes: number = DEFAULT_REVOKE_STALE_MINUTES,
): RevokeAge {
  if (revokeStatus !== 'compensating') return { pending: false, ageMinutes: null, stale: false };

  const requestedAt = revokeRequestedAt ? new Date(revokeRequestedAt) : null;
  if (!requestedAt || Number.isNaN(requestedAt.getTime())) {
    return { pending: true, ageMinutes: null, stale: false };
  }

  const threshold =
    Number.isFinite(thresholdMinutes) && thresholdMinutes > 0
      ? thresholdMinutes
      : DEFAULT_REVOKE_STALE_MINUTES;
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - requestedAt.getTime()) / 60_000));
  return { pending: true, ageMinutes, stale: ageMinutes >= threshold };
}

/**
 * REV-2 细化：`compensating` 的**两个窗口**——此前它们被折进同一个取值，聚合视图因此分不出。
 *
 * - `unacknowledged`：意图已写、**未获确认** → 请求**可能根本没到达**外部系统（进程在外呼中途死掉即此形）。
 * - `awaiting_target`：确认已到（对方应答过，含拒绝）→ **确实到达了**、只是没有终态。
 *
 * **无确认 ≠ 没到达**：本判据只说「没有到达的凭据」，不说「没到达」——这正是它与「到达了没回音」必须分开的原因。
 * 引入本列之前的旧行同样无确认，读作 `unacknowledged`（如实：确认记录确实不存在）。
 */
export type RevokeWindow = 'unacknowledged' | 'awaiting_target';

/**
 * 判读一行 `compensating` 落在哪个窗口。非 pending 态返回 null（既未了结，谈不上窗口）。
 * 只回答「有没有到达的凭据」，**不得**据此把状态改写成成功或失败。
 */
export function revokeWindow(
  revokeStatus: string | null | undefined,
  revokeAcknowledgedAt: Date | string | null | undefined,
): RevokeWindow | null {
  if (revokeStatus !== 'compensating') return null;
  // 确认时刻非法/缺失 → 视作**无到达凭据**（不把坏输入读成「确实到达了」——那正是过度声称）。
  const ack = revokeAcknowledgedAt ? new Date(revokeAcknowledgedAt) : null;
  return ack && !Number.isNaN(ack.getTime()) ? 'awaiting_target' : 'unacknowledged';
}
