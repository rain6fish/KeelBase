// SPDX-License-Identifier: Apache-2.0

/**
 * 从审计 `detail` 文本还原工具调用。
 *
 * 存在的理由：`ai_audit_logs` **没有独立的 `toolName` 列**，工具名只存在于 `detail`
 * 的 `` `${tool}(${args})` `` 形态里。凡是需要按工具名聚合的读取侧（证据根装配、BA 异常行为基线、
 * 决策轨迹、审计解释器、人类标签）都得走这里。
 *
 * **单一真源**：五个读取侧共用本函数。此前各写一份正则，字符集互不相同 ——
 * `audit-interpreter` 停在第一个数字（`summarize_customer_360` 整行被静默跳过）、
 * `ai-feature-map` 另有一条 `Tool:` 前缀分支而其余没有、`decision-trace` 用 `\w` 并且需要参数。
 * 现在按**并集**取：数字 / 大小写 / 下划线 + `Tool:` 分支 + 参数。
 *
 * 返回 `null` = 这条 detail 不像工具调用（或格式不符）——调用方据此**跳过**，
 * 不猜测、不误报（BA 规格 §3.2 把这个边界明确记为「静默漏检而非误报」）。
 */

export interface ParsedToolCall {
  toolName: string;
  /** `name(args)` 里的参数字符串；只匹配到 `name(` 前缀时为 `null`。 */
  args: string | null;
}

/**
 * 字符集取四处用到的**并集**：`[a-z_]+` / `[a-z0-9_]+` / `[a-z][a-z0-9_]+` 都是它的子集，
 * `\w`（decision-trace 那份）与它相等。取并集而非任一子集 —— 收窄会让已写进库的行读不出来。
 */
const TOOL_NAME = '[A-Za-z0-9_]+';

/** `name(args)`（完整形态，轨迹要参数）→ `name(`（只要名字）→ `Tool: name`（兼容分支）。 */
export function parseToolCall(detail?: string | null): ParsedToolCall | null {
  if (!detail) return null;
  const full = new RegExp(`^(${TOOL_NAME})\\((.*)\\)$`, 's').exec(detail);
  if (full) return { toolName: full[1], args: full[2] };
  const prefix = new RegExp(`^(${TOOL_NAME})\\(`).exec(detail);
  if (prefix) return { toolName: prefix[1], args: null };
  const prefixed = new RegExp(`\\bTool:\\s*(${TOOL_NAME})`, 'i').exec(detail);
  return prefixed ? { toolName: prefixed[1], args: null } : null;
}

/** 只取工具名的薄包装（证据根 / 行为基线按 null 跳过）。 */
export function extractToolName(detail?: string | null): string | null {
  return parseToolCall(detail)?.toolName ?? null;
}
