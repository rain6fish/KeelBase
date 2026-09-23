// SPDX-License-Identifier: Apache-2.0

/**
 * Approval execution axis (P2) — the single source for "did the approved write actually run?".
 *
 * The decision axis (`status`) already guarantees *at most one decision*: it is settled by a
 * conditional update whose `affected === 1` gate is the sole arbitration point. The **execution**
 * axis is a separate question the system never recorded, so an R4 approval interrupted mid-execution
 * (process killed, container restarted, external call hung then crashed) left a row that read
 * `approved` while the tool had never run — and a retry only ever answered `already decided`.
 *
 * Keeping the two axes apart is deliberate: adding an `executing` **state value** would widen the
 * frozen lifecycle corpus and every three-end surface that switches on `status`, for no gain — a row
 * can legitimately be `approved` *and* still running.
 *
 * 审批执行轴（P2）—— 「批准的那次写到底跑没跑成」的单一真源。
 *
 * 决策轴（`status`）已保证「至多一次裁决」（条件更新的 `affected === 1` 是唯一仲裁点）；
 * 而**执行**轴此前没有任何记录，于是 R4 审批在执行阶段中断时会留下「写着 approved、工具从未执行」的行，
 * 重试也只得到 `already decided`。两轴分开是有意的：往 `status` 里加 `executing` 会牵动冻结语料与
 * 三端所有按 status 分支的渲染面，却换不来什么——一行完全可以既是 `approved` 又**仍在执行中**。
 */
import { CONFIRMATION_STATUS } from './confirmation.store';

/**
 * How long one execution attempt is treated as "still running". A claim older than this is reported
 * as failed (we cannot know whether it crashed or hung), and the retry entry may re-claim it. A
 * fresh claim is reported as running and the retry entry refuses, so a retry cannot race a live
 * execution.
 *
 * 一次执行尝试被视为「仍在执行中」的时长。超过它的认领报为失败（我们无从分辨是崩溃还是挂起），
 * 且重试入口可重新认领；认领仍新鲜时报 running 且重试入口拒绝，避免重试与在途执行撞车。
 */
export const EXECUTION_LEASE_MS = 5 * 60 * 1000;

export type ExecutionState = 'not_started' | 'running' | 'succeeded' | 'failed';

/** Minimal row shape this derivation needs (kept structural so both list projections can call it).
 *  本推导所需的最小行形状（结构化，两个列表投影都能直接调用）。 */
export interface ExecutionAxisRow {
  status: string;
  executionClaimedAt?: Date | null;
  executedAt?: Date | null;
}

/**
 * Derive the outward execution state, or `null` when the row is not `approved` — an undecided,
 * declined or timed-out confirmation has no execution dimension at all, and reporting
 * "not_started" for it would imply something is still going to run.
 *
 * 推导对外的执行态；非 `approved` 的行返回 `null` —— 未裁决 / 已拒绝 / 已超时的确认不存在执行维度，
 * 对它报「not_started」会暗示「还将执行」。
 */
export function deriveExecutionState(
  row: ExecutionAxisRow,
  now: number = Date.now(),
): ExecutionState | null {
  if (row.status !== CONFIRMATION_STATUS.APPROVED) return null;
  if (row.executedAt) return 'succeeded';
  const claimedAt = row.executionClaimedAt?.getTime();
  if (!claimedAt) return 'not_started';
  return now - claimedAt < EXECUTION_LEASE_MS ? 'running' : 'failed';
}

/** Whether an execution attempt may start (or be retried) for this row.
 *  该行现在是否（可以 / 可以重试）开始一次执行。 */
export function isExecutionClaimable(row: ExecutionAxisRow, now: number = Date.now()): boolean {
  const state = deriveExecutionState(row, now);
  return state === 'not_started' || state === 'failed';
}
