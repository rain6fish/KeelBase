// SPDX-License-Identifier: Apache-2.0

/**
 * AW-18 — tool abortability: can a cancellation signal stop the **work**, or only our **wait**?
 *
 * Every tool shares one signature (`execute(args, userId)`), so nothing downstream could tell a
 * millisecond in-process read from an outbound call that keeps running after we stop awaiting it.
 * A cancellation therefore had only one vague reading. This module decides the classification once,
 * and with it the two readings a cancellation can produce:
 *
 *   yes      the work stops                  → the ledger says `aborted`
 *   no       the work keeps running          → the ledger says `abandoned`, outcome `unknown`
 *   unknown  we cannot say whether it stops  → the ledger says `abandoned`, outcome `unknown`
 *
 * Resolution order (first match wins):
 *   1. the tool's explicit `abortable` declaration;
 *   2. a local, in-process **read** (R0/R1, no confirmation) → `yes` — it either finished or never
 *      started, and it leaves nothing running that could still change state;
 *   3. everything else → `unknown`.
 *
 * Anything that leaves this process must declare `no` / `unknown` (see docs/tool-abortability.md for
 * the rule and the per-file exception table). A `no` / `unknown` call is held to a bounded window:
 * when it elapses we stop waiting and say so — the call is `abandoned`, never "succeeded".
 *
 * AW-14 adds the missing half: a cancellation is a **process**, not a fact. It is `requested` when we
 * ask, and only `confirmed` when the tool actually settles; a `yes` tool that does not settle inside
 * `CANCELLATION_CONFIRM_WINDOW_MS` is `unknown`. The conclusion `aborted` therefore needs both a `yes`
 * classification and a `confirmed` request — every other combination is `abandoned` with an unknown
 * outcome.
 *
 * AW-14 补上了缺的那一半：取消是一个**过程**，不是一个事实。我们提出要求时是 `requested`，只有工具
 * **真的返回**才是 `confirmed`；`yes` 工具在 `CANCELLATION_CONFIRM_WINDOW_MS` 内没有返回就是 `unknown`。
 * 于是 `aborted` 这个结论同时需要 `yes` 分类与已确认的请求 —— 其余组合一律 `abandoned`，结局未知。
 *
 * AW-18 —— 工具可中止性：取消信号停掉的是**工作**，还是只有我们的**等待**？
 *
 * 所有工具共用一个签名（`execute(args, userId)`），下游因此分不清一次毫秒级的进程内读与一个在
 * 我们停止等待后仍在跑的外部调用；取消只能被记成一个含糊的字。本模块在一处决定分类，并由此给出
 * 取消能产生的两种读数：
 *
 *   yes      工作会停                    → 账上记 `aborted`
 *   no       工作仍在跑                  → 账上记 `abandoned`，结局 `unknown`
 *   unknown  说不准会不会停              → 账上记 `abandoned`，结局 `unknown`
 *
 * 判定顺序（先命中者为准）：
 *   1. 工具显式声明 `abortable`；
 *   2. 本地进程内的**读**（R0/R1、无需确认）→ `yes` —— 它要么已经做完、要么从未开始，不留下还能
 *      继续改变状态的东西；
 *   3. 其余一律 `unknown`。
 *
 * 任何离开本进程的调用必须声明 `no` / `unknown`（规则与按文件的例外表见 docs/tool-abortability.md）。
 * `no` / `unknown` 的调用受一个有界窗口约束：窗口到点就停止等待并如实说 —— 这次调用是 `abandoned`，
 * 不会是「成功」。
 *
 * AW-14 的取消三态与结论见本文件下方 `CancellationState` / `cancellationReading`。
 * The AW-14 three-state cancellation and its conclusion live below in `CancellationState` /
 * `cancellationReading`.
 */

import {
  AiTool,
  ToolAbortability,
  ToolResult,
  resolveRiskLevel,
} from '../interfaces/tool.interface';

/**
 * How long the executor keeps awaiting a tool that cannot be stopped (`no` / `unknown`), in ms.
 *
 * The window exists so a hung call cannot hold the turn forever; when it elapses the outcome is
 * `unknown` and the call is recorded as `abandoned`. It is deliberately generous: an abandoned call
 * is a loud reading, not a normal one, so the bound must only fire on calls that are genuinely stuck.
 *
 * 执行器对**停不掉**（`no` / `unknown`）的工具最多等待多久（毫秒）。
 *
 * 窗口的作用是不让一次挂死的调用永远占着这一轮；到点后结局是 `unknown`、调用记 `abandoned`。
 * 取值有意放宽：被放弃是一次**醒目**的读数，不是常态，所以上限只该在真的卡住时才触发。
 */
export const NON_ABORTABLE_TOOL_WINDOW_MS = 60_000;

/**
 * How far a cancellation has got (AW-14, F-61).
 *
 * - `requested` — we asked the work to stop (a user/revocation abort, or the bounded window elapsed).
 *   Asking is not stopping, and must never be recorded as if it were.
 * - `confirmed` — the work actually settled after the request. For a `yes` tool this is what earns
 *   `aborted`; a `no` / `unknown` tool can settle too, but its classification still forbids `aborted`
 *   (the thing we cannot see may already have happened on the other side).
 * - `unknown` — a `yes` tool was asked to stop and did not settle within the confirmation window. We
 *   no longer know whether it is still running.
 *
 * 取消走到了哪一步（AW-14，F-61）。
 *
 * - `requested` —— 我们已经要求工作停下（用户/撤权触发的中止，或有界窗口到点）。**要求不等于停下**，
 *   绝不能记成已经停了。
 * - `confirmed` —— 请求之后工作**确实返回了**。对 `yes` 工具，这才是 `aborted` 的凭据；`no` / `unknown`
 *   的工具也可能返回，但它的分类仍然禁止 `aborted`（我们看不见的那一侧可能已经发生）。
 * - `unknown` —— `yes` 工具被要求停下，却在确认窗口内没有返回。我们已不知道它是否仍在跑。
 */
export type CancellationState = 'requested' | 'confirmed' | 'unknown';

/**
 * How long the executor waits, after asking a `yes` tool to stop, for the tool to actually settle.
 *
 * A `yes` tool is *supposed* to stop, but "supposed to" is a declaration, not a fact. This window is
 * the difference between the two: settling inside it is `confirmed` (the ledger may say `aborted`),
 * not settling is `unknown` (the call is `abandoned`). Deliberately short — a tool that honours the
 * signal returns at once; one that does not must not hold the turn while we wait to find out.
 *
 * 执行器在要求 `yes` 工具停下之后，最多再等多久让它**真的返回**。
 *
 * `yes` 工具**应当**停下，但「应当」是声明、不是事实。这个窗口就是两者的分界：窗内返回 = `confirmed`
 * （账上可以记 `aborted`）；没有返回 = `unknown`（这次调用记 `abandoned`）。取值有意短 —— 尊重信号的
 * 工具会立即返回；不尊重的工具也不该让我们为了弄清这一点而占着这一轮。
 */
export const CANCELLATION_CONFIRM_WINDOW_MS = 500;

/** Classify a tool: its own declaration wins, then the local in-process read rule. */
export function resolveAbortability(
  tool: Pick<AiTool, 'abortable' | 'requiresConfirmation' | 'riskLevel'>,
): ToolAbortability {
  if (tool.abortable) return tool.abortable;
  const risk = resolveRiskLevel(tool);
  const localRead = tool.requiresConfirmation !== true && (risk === 'R0' || risk === 'R1');
  return localRead ? 'yes' : 'unknown';
}

/** What a cancellation is called, given the tool's abortability **and** how far it got. */
export type CancellationReading = 'aborted' | 'abandoned';

/**
 * The conclusion: `aborted` needs **both** a tool that can stop and a cancellation that was confirmed.
 * Everything else is `abandoned` — a request that was never confirmed is not a stop, and a `no` /
 * `unknown` tool is not made stoppable by having returned.
 *
 * 结论：`aborted` **同时**要求工具停得掉、且取消已确认。其余一律 `abandoned` —— 未获确认的请求不是
 * 停止，而 `no` / `unknown` 的工具也不会因为「返回了」就变成停得掉。
 */
export function cancellationReading(
  abortable: ToolAbortability,
  state: CancellationState,
): CancellationReading {
  return abortable === 'yes' && state === 'confirmed' ? 'aborted' : 'abandoned';
}

/**
 * The result of a cancelled call. Never `success: true`. The sentence carries the three-state reading
 * and the conclusion into the ledger through the existing `errorMessage` column — the audit `outcome`
 * vocabulary is frozen (`executed / pending / blocked / refused / declined / failed`), so a cancelled
 * call stays `failed` and the distinction lives in this sentence, not in a new field.
 *
 * - `aborted` says the work stopped; it does not claim what the work had already done.
 * - `abandoned` says the outcome is unknown — a reader (or the model) must not turn "we stopped
 *   waiting" into "it did not run".
 *
 * 被取消的调用返回的结果。`success` 永远不是 `true`。句子把取消三态与结论，经既有的 `errorMessage`
 * 列带进账 —— 审计 `outcome` 是冻结词表（`executed / pending / blocked / refused / declined /
 * failed`），故被取消的调用仍记 `failed`，区分写在这句里，不新增字段。
 *
 * - `aborted` 说工作已停；不对停之前做过什么下断言。
 * - `abandoned` 说结局未知 —— 读的人（或模型）不能把「我们停止等待」读成「它没有执行」。
 */
export function cancelledToolResult(
  toolName: string,
  abortable: ToolAbortability,
  state: CancellationState,
): ToolResult {
  const reading = cancellationReading(abortable, state);
  if (reading === 'aborted') {
    return {
      success: false,
      error: `工具 "${toolName}" 已中止（aborted）：取消已确认（cancellation confirmed），工作已停止，本次未完成`,
    };
  }
  if (state === 'unknown') {
    return {
      success: false,
      error:
        `工具 "${toolName}" 已放弃等待（abandoned）：无法确认工作是否停下（cancellation unknown）` +
        ` —— 结果未知（unknown）`,
    };
  }
  if (state === 'confirmed') {
    return {
      success: false,
      error:
        `工具 "${toolName}" 已放弃等待（abandoned）：工作已返回（cancellation confirmed），` +
        `但该工具无法被断言为可中止（分类 ${abortable}）—— 结果未知（unknown）`,
    };
  }
  return {
    success: false,
    error:
      `工具 "${toolName}" 已放弃等待（abandoned）：取消未获确认（cancellation requested），` +
      `工作可能仍在进行 —— 结果未知（unknown）`,
  };
}
