// SPDX-License-Identifier: Apache-2.0

/**
 * Did the request even leave? One answer, shared by every reader that has to make that claim.
 *
 * The distinction is load-bearing in two places — the error text a caller sees and the conclusion a
 * target-status query is allowed to reach — and both mean the same thing by it, so the predicate
 * lives in one module rather than being copied into each. A copy that drifts would let the same
 * failure be "unreachable" in one reading and "maybe delivered" in the other.
 *
 * 请求到底送出去了没有？凡是需要下这个断言的地方，共用同一个答案。
 *
 * 这个区分在两处承重 —— 调用方看到的错误文案，与目标状态查询被允许得出的结论 —— 两处指同一件事，
 * 故判据只存一份，而不是各抄一遍。一旦副本漂移，同一次失败就会在一处读作「不可达」、在另一处读作
 * 「可能已到达」。
 */

/**
 * Codes that mean the connection **never opened**: the request cannot have been sent, so "not sent" is
 * a claim the transport layer supports. Everything else stays indeterminate rather than being read as
 * unreachable — a reset arriving after the request went out means the target may have received it, and
 * that is a different fact from never having got there.
 *
 * 这些码意味着**连接根本没建立**：请求不可能发出去，所以「没送到」是传输层支持得起的断言。其余一律留作
 * 不确定、**不**读作「不可达」——请求发出之后才来的重置意味着目标可能已经收到，那是与「根本没到」**不同**的
 * 一件事实。
 */
export const NEVER_SENT_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND', // DNS 查不到主机
  'EAI_AGAIN', // DNS 暂时失败
  'ECONNREFUSED', // 对端在连上之前拒绝
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** undici 把底层错误码挂在 `cause.code`，裸 socket 错误挂在 `code` —— 两处都看。 */
export function transportCode(err: unknown): string {
  const e = err as { code?: unknown; cause?: unknown } | null;
  const cause = (e?.cause ?? undefined) as { code?: unknown } | undefined;
  if (typeof cause?.code === 'string') return cause.code;
  return typeof e?.code === 'string' ? e.code : '';
}
