// SPDX-License-Identifier: Apache-2.0

/**
 * The vocabulary of a **one-shot, read-only** query against an external write target: "did you execute
 * this action key?" (AW-17).
 *
 * It is a separate file for the same reason `revoke-status.ts` is: the words are read by the entity
 * that stores the evidence, by the probe that produces it, and by the service that converges the
 * ledger — one declaration, and a missing value fails to compile at every use instead of silently
 * widening.
 *
 * **`unknown` is not a lesser `not_executed`.** It is the answer for every case where the target was
 * not asked, could not be asked, or answered something this vocabulary cannot recognise. Reading it as
 * `not_executed` would assert that no write happened — and that is the one claim a missing answer does
 * not support. The same boundary the audit outcome vocabulary draws between `failed` (tried and
 * broke) and `not_executed` (nothing ran) applies here, one level up: no query is not an answer.
 *
 * 对外部写目标做**一次性、只读**查询（「这个 action key 你执行了吗？」）所用的词表（AW-17）。
 *
 * 单独成文件的理由与 `revoke-status.ts` 相同：这些词被存证据的实体、产证据的探针、收敛账的服务三处
 * 读到 —— 一处声明，删掉一个取值会在每一处使用上编译失败，而不是悄悄放宽。
 *
 * **`unknown` 不是弱一些的 `not_executed`**。凡是「没问 / 问不到 / 答了本词表认不出的话」，答案都是它。
 * 把它读成 `not_executed` 等于断言那次写没发生 —— 而那正是「没有答案」支持不起的那句话。审计结局词表
 * 里 `failed`（试过、坏了）与 `not_executed`（一次没跑）的分界，在这里高一层处同样成立：**没查过不是答案**。
 */

export const TARGET_STATUS = {
  /** The target says the action key was executed. / 目标说该 action key 执行过。 */
  EXECUTED: 'executed',
  /** The target says it was **not** executed. / 目标说**没有**执行。 */
  NOT_EXECUTED: 'not_executed',
  /** No answer, no query channel, or an answer this vocabulary does not recognise. / 没有答案。 */
  UNKNOWN: 'unknown',
} as const;

export type TargetStatusConclusion = (typeof TARGET_STATUS)[keyof typeof TARGET_STATUS];

/**
 * Why a conclusion is `unknown`. Every one of these means "the target did not tell us", and none of
 * them means "it did not run".
 *
 * `target-status-unavailable` is also the coverage-gap id (`coverage-gaps.ts`): the same fact a person
 * reads off one lookup is the one a package has to declare about itself.
 *
 * 结论为 `unknown` 的成因。每一种都是「目标没有告诉我们」，没有一种是「它没跑」。
 *
 * `target-status-unavailable` 同时也是覆盖缺口 id（`coverage-gaps.ts`）：一个人从单次查询读到的这件事，
 * 正是一份包必须对自己声明的同一件事。
 */
export type TargetStatusLookupReason =
  /** The target offers no status query (no `statusPath`, or an external MCP server: no channel at all). */
  | 'target-status-unavailable'
  /** A query is configured but cannot be used (method not GET, absolute/`//` path, unfilled placeholder). */
  | 'misconfigured'
  /** The query was sent and timed out. / 查询已发出但超时。 */
  | 'timeout'
  /** The connection never opened — the query cannot have reached the target. / 连接没建立过，查询不可能到达。 */
  | 'unreachable'
  /** The call failed after the request may have gone out, so the query's own fate is unknown. / 调用失败。 */
  | 'call_failed'
  /** The target answered with a non-2xx status. / 目标回了非 2xx。 */
  | 'non_2xx'
  /** The target answered, but not in a shape this vocabulary recognises. / 答了，但认不出。 */
  | 'unrecognized_answer';

/**
 * What one lookup leaves behind: **when**, **by what query**, and **what it concluded**.
 *
 * `queryPath` is the path actually requested (the action key substituted in). The key itself is the
 * ledger's hash-shaped idempotency key, so it is safe to keep — and keeping it is what makes the
 * evidence comparable to the claim row it is about.
 *
 * 一次查询留下的东西：**何时**、**按什么查**、**结论是什么**。
 *
 * `queryPath` 是真正请求过的路径（action key 已代入）。键本身就是账本那个哈希形状的幂等键，故留下它
 * 是安全的 —— 而留下它，这份证据才与它所针对的占位行可比。
 */
export interface TargetStatusLookup {
  /** ISO 8601. / ISO 8601。 */
  queriedAt: string;
  /** The HTTP method actually used — `GET` only; a write is never a status query. / 实到的 HTTP 方法。 */
  queryMethod: string;
  /** The path actually requested. / 真正请求过的路径。 */
  queryPath: string;
  conclusion: TargetStatusConclusion;
  /** `null` when the conclusion is a real answer. / 结论是真答案时为 `null`。 */
  reason: TargetStatusLookupReason | null;
}
