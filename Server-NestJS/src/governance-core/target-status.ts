// SPDX-License-Identifier: Apache-2.0

import type { DedupDeclaration } from './tool-dedup';

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
 * R-1: **what a real answer is based on** — a current-state snapshot, or the target's own acceptance
 * record.
 *
 * `not_executed` covers two different questions: "this key is not there now" and "this key was never
 * accepted". A retry decision that treats them as one can duplicate an external write whose record was
 * later reversed or deleted. The target is the only party that can tell which question it answered;
 * when it does not say, the reading is `absent` — never guessed from the method or the path, because
 * both kinds are asked with the same single `GET`.
 *
 * **A receipt is not an authority claim.** An eventually consistent receipt can still miss a very
 * recent acceptance. This vocabulary says *what the answer is based on*, not how true it is.
 *
 * R-1：**真答案基于什么** —— 当前状态快照，还是目标自己的受理记录。
 *
 * `not_executed` 覆盖两个不同的问题：「这个 key 现在不在」与「这个 key 从未被接受」。把两者当成一个，
 * 重试决定就可能重复一次外部写 —— 它的记录后来被撤销或删除了。只有目标能说清它回答的是哪一个；
 * 它不说时，读数就是「未声明」—— **绝不从方法或路径反推**，因为两种种类用的是同一条单次 `GET`。
 *
 * **收据不是权威声明**。最终一致的收据同样可能漏掉刚发生的受理。本词表说的是**答案基于什么**，
 * 不是它有多真。
 */
export const TARGET_STATUS_BASIS = {
  /** The target answered from its live object store. / 目标按当前对象存储作答。 */
  CURRENT_STATE: 'current_state',
  /** The target answered from its own acceptance/event record. / 目标按自己的受理 / 事件记录作答。 */
  RECEIPT: 'receipt',
} as const;

export type TargetStatusBasis = (typeof TARGET_STATUS_BASIS)[keyof typeof TARGET_STATUS_BASIS];

/**
 * The basis as a **read face** reports it: the two declared kinds plus `unknown` for "the target did
 * not say, or the row predates the column". Storage keeps `null` for the latter (see the entity), so
 * "asked before we could record a basis" stays distinguishable from "asked after and the target did
 * not say".
 *
 * 读面报出的种类：两种已声明的种类，再加 `unknown` 表示「目标没说，或该行早于本列」。存储侧对后者
 * 保持 `null`（见实体），于是「问的时候我们还记不了种类」与「问了、目标没说」仍可区分。
 */
export type TargetStatusLookupBasisView = TargetStatusBasis | 'unknown';

/**
 * Anything read off a stored row or copied into an off-chain column → the **read face** vocabulary.
 * A value this vocabulary does not recognise is `unknown`, never echoed: an unrecognised word in a
 * report would let a future basis appear as if it were already defined here.
 *
 * 凡从存储行读出、或复制进链外列的值 → **读面**词表。本词表不认识的取值一律 `unknown`，绝不原样
 * 回显：报表里出现一个认不出的词，等于让未来的种类看起来像这里已经定义过。
 */
export function targetStatusBasisView(raw: unknown): TargetStatusLookupBasisView {
  return raw === TARGET_STATUS_BASIS.CURRENT_STATE || raw === TARGET_STATUS_BASIS.RECEIPT
    ? raw
    : 'unknown';
}

/**
 * R-9: may a `not_executed` answer release the hold, so the same key can execute again?
 *
 * A **receipt** answers the question a retry asks: the target's own acceptance record says this action
 * key was never accepted, so re-sending it cannot duplicate an effect the target never took. It
 * releases **any** effect.
 *
 * A **current-state** reading answers a different question: "this key is not there now". A record can
 * be reversed or deleted later, so this reading cannot show that a non-idempotent effect never ran.
 * A reading with no declared basis (`null`) is not stronger than a weak one — silence is not a
 * receipt either.
 *
 * The one thing that still licenses a retry on a weak reading is the target's **dedup guarantee**
 * (`dedup = yes` on the tool's capability declaration): an outbound write carries the ledger's
 * idempotency key, and a target that honours that key drops a repeat of the same logical call. `dedup`
 * is **not** a statement that the effect is idempotent — it is the target promising to drop duplicates
 * by key. `no` says it does not honour the key; `unknown` (and an absent declaration, which resolves to
 * `unknown`) says nobody told us, and is read exactly like `no`: silence cannot license a retry. No
 * tool declaration says an effect is idempotent, so that cannot be consulted or inferred.
 *
 * R-9：`not_executed` 的答案能否释放占位，让同一个键再执行一次？
 *
 * **收据**回答的正是重试要问的问题：目标自己的受理记录说这个 action key 从未被接受，故重发它不可能
 * 重复一个目标从未接受过的效果。它对**任何**效果都放行。
 *
 * **当前状态**读数回答的是另一个问题：「这个键现在不在」。记录之后可能被撤销或删除，故这份读数证明
 * 不了非幂等效果从未落地。没有声明种类的读数（`null`）也不比弱读数更强 —— 沉默不是一张收据。
 *
 * 弱读数下仍能授权重试的只有目标的**去重保证**（工具能力声明里的 `dedup = yes`）：出站写携带账本的
 * 幂等键，而遵守该键的目标会丢掉同一逻辑调用的重复。`dedup` **不是**「效果幂等」的声明 —— 它是目标
 * 承诺按键去重。`no` 表示目标不遵守该键；`unknown`（以及缺席声明解析出的 `unknown`）表示没人告诉过
 * 我们，按 `no` 一样读：沉默不能授权重试。没有任何工具声明说某个效果是幂等的，故那件事无从查询、
 * 也不得推断。
 */
export function notExecutedReleasesHold(
  basis: TargetStatusBasis | null,
  dedup: DedupDeclaration,
): boolean {
  if (basis === TARGET_STATUS_BASIS.RECEIPT) return true;
  return dedup === 'yes';
}

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
  /**
   * The target answered 401/403: it **refused to show** the record (F-122). A deliberate refusal is
   * its own fact — folding it into `non_2xx` would make "not permitted to look" and "the target is
   * broken" the same reading.
   *
   * 目标回了 401/403：它**拒绝展示**这条记录（F-122）。有意的拒绝自成一件事 —— 并进 `non_2xx`
   * 会让「不让看」与「坏了」读成同一个值。
   */
  | 'not_permitted'
  /** The target answered with a non-2xx status other than 401/403. / 目标回了 401/403 以外的非 2xx。 */
  | 'non_2xx'
  /** The target answered, but not in a shape this vocabulary recognises. / 答了，但认不出。 */
  | 'unrecognized_answer'
  /**
   * History mode only: the target says it keeps no history for this kind of record. Distinct from
   * `not_permitted` (it has something but will not show it) and from `non_2xx` (the route is broken).
   *
   * 仅历史模式：目标说它不为这类记录保留历史。与 `not_permitted`（有、但不给看）和 `non_2xx`
   * （路由坏了）都不同。
   */
  | 'history-unavailable'
  /**
   * History mode only: the target's retained history does not reach the moment this action key
   * occurred, and it said so. The absence we would otherwise read is outside what it kept.
   *
   * 仅历史模式：目标保留的历史覆盖不到该键发生的时刻，且它明说了。我们看到的「没有」落在它保留的
   * 范围之外。
   */
  | 'history-does-not-cover'
  /**
   * History mode only: the target returned part of its history and disclosed that there is more.
   * What is missing from this page was never shown, which is not the same as never happened.
   *
   * 仅历史模式：目标只返回了部分历史，并披露还有更多。这一页里没有的东西从未被展示过，这与「从未
   * 发生」不是一回事。
   */
  | 'history-truncated'
  /**
   * History mode only: the target showed a history (possibly empty) but stated no verdict for this
   * action key. Events are material, not a decision — reading them as one is the inference R-1 keeps
   * out of this layer.
   *
   * 仅历史模式：目标展示了历史（可能为空），却没有对该 action key 给出判决。事件是材料，不是判决 ——
   * 把它读成判决正是 R-1 挡在这一层之外的那种推断。
   */
  | 'history-no-verdict';

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
  /**
   * R-1: what a real answer is based on; `null` when the target did not say (or there is no answer).
   * Never inferred from the query — see {@link TARGET_STATUS_BASIS}.
   *
   * R-1：真答案基于什么；目标没说（或根本没有答案）时为 `null`。绝不从查询反推 —— 见
   * {@link TARGET_STATUS_BASIS}。
   */
  basis: TargetStatusBasis | null;
}
