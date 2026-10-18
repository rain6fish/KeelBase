// SPDX-License-Identifier: Apache-2.0

/**
 * The ONE state an operator is shown for a single AI action.
 *
 * <p><b>Why it exists.</b> Three different enums describe an AI action today, on three different rows:
 * the audit row's `outcome` (executed / pending / blocked / refused / declined / failed …), the
 * confirmation request's `status` (pending / approved / declined / timeout …), and the side effect's
 * `revokeStatus` (revoked / compensating / revoke_failed). A reader who is handed all three has to
 * decide for themselves which one wins — and the three mistakes that follow are the ones this project
 * keeps writing warnings about: a hash chain that verifies is not a record of every action; a revoke
 * that was *requested* is not a business that *recovered*; and a state whose outcome nobody knows gets
 * filed as if it did. So the viewer is handed one value, derived here, once.
 *
 * <p><b>The vocabulary is larger than the five the roadmap names.</b> The roadmap's row for this work
 * lists 失败 / 待确认 / 补偿中 / 补偿成功 / 结果未知 and calls them mutually exclusive and exhaustive.
 * They are mutually exclusive, but not exhaustive, and the data says so: `revoke_status` carries
 * `revoke_failed` (a compensation that ran and failed), and a great many actions simply executed, or
 * were refused before anything happened. Dropping those three would force them into a neighbouring
 * bucket — which is the conflation this whole surface exists to stop. The five are kept **as named**;
 * `compensation_failed`, `executed` and `rejected` join them. That discrepancy is recorded on the
 * roadmap row rather than silently resolved here.
 *
 * <p><b>Order decides, and the order is chronological.</b> A later fact wins over an earlier one: an
 * action still waiting for a human has not happened yet, so that answer comes first; an action that
 * was executed and then compensated is known by the compensation, not by the execution. Each step
 * below states which fact it is reading and why it outranks the ones under it.
 *
 * 一次 AI 行为**给操作者看的那一个状态**。
 *
 * <p><b>为什么有它。</b>今天有三套枚举在描述一次 AI 行为，长在**三张不同的行**上：审计行的
 * `outcome`（executed / pending / blocked / refused / declined / failed …）、确认请求的 `status`
 * （pending / approved / declined / timeout …）、副作用行的 `revokeStatus`（revoked /
 * compensating / revoke_failed）。把三个一起交出去，读者就得自己决定**谁说了算**——而随之而来的
 * 三种误读，正是本项目反复写警告的那三种：哈希链验得过**不等于**每个动作都被记下；撤销**被请求过**
 * 不等于业务**已恢复**；结局没人知道的那个状态会被**当成知道了**归档。所以这里**只交一个值**，
 * 在**这里算一次**。
 *
 * <p><b>词表比 roadmap 点名的五个大。</b>本项在 roadmap 上那一行写的是 失败 / 待确认 / 补偿中 /
 * 补偿成功 / 结果未知，并称其**互斥且穷尽**。互斥成立，**穷尽不成立**，数据如此回答：`revoke_status`
 * 带着 `revoke_failed`（补偿跑了、失败了），而大量动作就是**执行成功**或**在被拒时什么都没发生**。
 * 把这三个丢掉，它们就会被塞进邻居的桶里——而那正是这个面存在的理由。**五态照名保留**，
 * `compensation_failed` / `executed` / `rejected` 与之并列。这处出入**记在 roadmap 行上**，
 * 不在这里悄悄抹平。
 *
 * <p><b>顺序即判断，而顺序是时间序。</b>后发生的事实压过先发生的：还在等人批准的动作**尚未发生**，
 * 故它排最前；执行过、之后又被补偿的动作，由**补偿**而不是执行来代表。下面每一步都写明它读的是
 * 哪个事实、以及为什么它压得住排在它下面的那些。
 */

import { REVOKE_STATUS, type RevokeStatus } from '../tool-effects/revoke-status';

/** The single value the viewer shows. See the header for why it is not the roadmap's five. */
export type ExplanationState =
  | 'awaiting_confirmation'
  | 'compensation_failed'
  | 'compensation_succeeded'
  | 'compensating'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'result_unknown';

/** Every value, in the order the derivation considers them. Specs walk this to prove none is missed. */
export const EXPLANATION_STATES: readonly ExplanationState[] = [
  'awaiting_confirmation',
  'compensation_failed',
  'compensation_succeeded',
  'result_unknown',
  'compensating',
  'failed',
  'rejected',
  'executed',
];

/** The three outcome words that mean "a policy or a person said no before anything ran". */
const REJECTED_OUTCOMES = new Set(['blocked', 'refused', 'declined']);

/** The confirmation statuses that mean "the action is still waiting for the person". */
const AWAITING_STATUSES = new Set(['pending', 'pending_approval']);

/** The two windows in which the target's state is, by definition, not known. */
const UNKNOWN_WINDOWS = new Set(['unacknowledged', 'awaiting_target']);

/** Everything the derivation reads. Nothing it does not. */
export interface ExplanationStateInput {
  /** The audit row's `outcome`, when the row has one. */
  outcome?: string | null;
  /** The audit row's `isError`. Read only because rows written before `outcome` existed still carry it. */
  isError?: boolean | number | null;
  /** `ai_confirmation_requests.status` for the confirmation this action went through, if any. */
  confirmationStatus?: string | null;
  /** `ai_tool_side_effects.revoke_status`, if the action produced an effect. */
  revokeStatus?: RevokeStatus | null;
  /** REV-2's window on a `compensating` effect: whether the target has been heard from. */
  revokeWindow?: string | null;
}

/**
 * The one state, given what is known.
 *
 * <p>Order, and why each step outranks the next: someone is still holding it, so it has not happened —
 * nothing later can be true; a compensation that ran and failed is the latest fact there is; one that
 * ran and succeeded likewise; a compensation whose target never answered is **not** "in progress", it
 * is unknown, and saying otherwise is the second of the three misreads; what remains is the ordinary
 * ending of the action itself, read from the audit row.
 *
 * 给出已知之后的那**一个**状态。
 *
 * <p>顺序，以及每一步为什么压得住下一步：有人还扣着它，故它**尚未发生**——后面那些不可能成立；
 * 跑过并失败的补偿是**最新**的事实；跑过并成功的同理；目标从未回音的补偿**不是"进行中"**，而是
 * **未知**，说成前者正是三种误读里的第二种；剩下的，就是这次动作本身的普通结局，读审计行。
 */
export function explainState(input: ExplanationStateInput): ExplanationState {
  if (input.confirmationStatus && AWAITING_STATUSES.has(input.confirmationStatus)) {
    return 'awaiting_confirmation';
  }
  if (input.revokeStatus === REVOKE_STATUS.REVOKE_FAILED) return 'compensation_failed';
  if (input.revokeStatus === REVOKE_STATUS.REVOKED) return 'compensation_succeeded';
  if (input.revokeStatus === REVOKE_STATUS.COMPENSATING) {
    return input.revokeWindow && UNKNOWN_WINDOWS.has(input.revokeWindow)
      ? 'result_unknown'
      : 'compensating';
  }
  if (input.outcome === 'failed' || input.isError) return 'failed';
  if (input.outcome && REJECTED_OUTCOMES.has(input.outcome)) return 'rejected';
  return 'executed';
}
