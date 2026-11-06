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

/** Classify a tool: its own declaration wins, then the local in-process read rule. */
export function resolveAbortability(
  tool: Pick<AiTool, 'abortable' | 'requiresConfirmation' | 'riskLevel'>,
): ToolAbortability {
  if (tool.abortable) return tool.abortable;
  const risk = resolveRiskLevel(tool);
  const localRead = tool.requiresConfirmation !== true && (risk === 'R0' || risk === 'R1');
  return localRead ? 'yes' : 'unknown';
}

/** What a cancellation is called, given the tool's abortability. */
export type CancellationReading = 'aborted' | 'abandoned';

export function cancellationReading(abortable: ToolAbortability): CancellationReading {
  return abortable === 'yes' ? 'aborted' : 'abandoned';
}

/**
 * The result of a cancelled call. Never `success: true`, and for `no` / `unknown` the sentence says
 * the outcome is unknown — a reader (or the model) must not turn "we stopped waiting" into "it did
 * not run". `yes` says the work stopped; it does not claim what the work had already done.
 *
 * 被取消的调用返回的结果。`success` 永远不是 `true`；对 `no` / `unknown`，句子明说结局未知 —— 读的人
 * （或模型）不能把「我们停止等待」读成「它没有执行」。`yes` 说工作已停，但不对停之前做过什么下断言。
 */
export function cancelledToolResult(toolName: string, abortable: ToolAbortability): ToolResult {
  return {
    success: false,
    error:
      cancellationReading(abortable) === 'aborted'
        ? `工具 "${toolName}" 已中止（aborted）：工作已停止，本次未完成`
        : `工具 "${toolName}" 已放弃等待（abandoned）：只停止了等待，工作可能仍在进行 —— 结果未知（unknown）`,
  };
}
