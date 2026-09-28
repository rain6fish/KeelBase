// SPDX-License-Identifier: Apache-2.0

/**
 * ACT-5: **what became of one write attempt** — the single source for reading `ai_tool_executions`.
 *
 * Kept apart from the service for the same reason `revoke-staleness.ts` is: this is a *judgement*
 * over a row, and every reader must reach it through the same function or two surfaces will answer
 * the same row differently.
 *
 * **It deliberately does not reuse `deriveExecutionState`** (the R4 approval axis), even though the
 * column shape matches. That function reads an expired claim as **`failed`** — a fair call for a
 * one-shot approval, because the retry entry is allowed to re-claim and there is no other way back.
 * Here the subject is an **irreversible write**: a claim that was never settled means the tool *may
 * have run*, and saying "failed" would be a claim we cannot support while saying "succeeded" would be
 * worse. It reads **`unknown`**, and a re-attempt is refused (the same trade ARC-3's dispatch claim
 * makes: rather not execute once than execute an irreversible action twice). Only the lease constant
 * is shared, so the two axes cannot drift about how long "still running" lasts.
 *
 * ACT-5：**一次写尝试后来怎样了** —— 读 `ai_tool_executions` 的单一真源。
 *
 * 与 `revoke-staleness.ts` 同样的理由把它从服务里分出来：这是对一行的**判断**，而每个读者都必须经由
 * 同一个函数，否则两个面会对同一行给出不同答案。
 *
 * **刻意不重用 `deriveExecutionState`**（R4 审批轴），尽管列形状是一样的。那个函数把过期的认领读作
 * **`failed`** —— 对一次性审批是公允的（重试入口允许重认领，否则没有回头路）。而这里的对象是**不可逆
 * 的写**：认领了却从未落定，意味着工具**可能已经跑过**，说「失败」是我们支撑不起的断言，说「成功」
 * 更糟。它读作 **`unknown`**，且**拒绝再次尝试**（与 ARC-3 派发认领同一条取舍：宁可少执行一次，也不
 * 把不可逆的动作执行两次）。只共用租约常量，故两条轴在「仍在执行中」有多久这件事上不会漂移。
 */
import { EXECUTION_LEASE_MS } from '../confirmation/execution-state';

export type ToolExecutionState = 'succeeded' | 'running' | 'unknown' | 'failed';

/**
 * The execution axis of one row (structural, so callers may pass the entity itself).
 *
 * 一行的执行轴（结构化，故调用方可直接传实体）。
 */
export interface ToolExecutionAxisRow {
  createdAt: Date;
  settledAt?: Date | null;
  error?: string | null;
}

/**
 * Derive what became of this execution.
 *
 * `error` is checked before `settledAt` on purpose: a recorded failure is a fact, and were the two
 * ever to coexist, reading "succeeded" would be the one answer we must never give.
 *
 * 推导这次执行后来怎样了。`error` 有意先于 `settledAt` 判：有记录的失败是事实，而两者万一并存，
 * 「成功」是那个我们绝不能给出的答案。
 */
export function deriveToolExecutionState(
  row: ToolExecutionAxisRow,
  now: number = Date.now(),
): ToolExecutionState {
  if (row.error != null) return 'failed';
  if (row.settledAt) return 'succeeded';
  const claimedAt = row.createdAt?.getTime();
  // 没有认领时刻的行读不出来 —— 但我们不去猜它成功或失败，如实说不知道。
  if (!claimedAt) return 'unknown';
  return now - claimedAt < EXECUTION_LEASE_MS ? 'running' : 'unknown';
}

/**
 * What to tell the caller when the key is already taken. One exit for all three refusals, so a
 * caller never gets a bare "failed" that hides *which* of them it hit — being told "still running"
 * and "outcome unknown" call for different next moves.
 *
 * 键已被占用时告诉调用方什么。三种拒绝共用一个出口，故调用方不会收到一个看不出是哪种的
 * 「失败」—— 「还在跑」与「结果未知」要求不同的下一步。
 */
export function toolExecutionRefusal(state: ToolExecutionState, error?: string | null): string {
  switch (state) {
    case 'succeeded':
      return '这次写此前已执行完成（幂等回放）';
    case 'running':
      return '同参数的另一次执行正在进行中，本次未执行';
    case 'failed':
      return `这次写此前执行失败（${error ?? '未记录原因'}），本次未重复执行`;
    case 'unknown':
    default:
      return '这次写已认领但未落定，结果未知 —— 不得视为成功，也不得视为失败；本次未重复执行';
  }
}
