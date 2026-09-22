// SPDX-License-Identifier: Apache-2.0

/**
 * 从审计 `detail` 文本还原工具名。
 *
 * 存在的理由：`ai_audit_logs` **没有独立的 `toolName` 列**，工具名只存在于 `detail`
 * 的 `` `${tool}(${args})` `` 形态里。凡是需要按工具名聚合的读取侧（证据根装配、BA 异常行为基线）
 * 都得走这里。
 *
 * **单一真源**：读取侧与其它读取侧共用本函数。各写一份正则的话，写入格式一漂移就会出现
 * 「写进去的读不出来」而两边都察觉不到。
 *
 * 返回 `null` = 这条 detail 不像工具调用（或格式不符）——调用方据此**跳过**，
 * 不猜测、不误报（BA 规格 §3.2 把这个边界明确记为「静默漏检而非误报」）。
 */
export function extractToolName(detail?: string | null): string | null {
  if (!detail) return null;
  // Tool names may carry digits (`summarize_customer_360`) — a `[a-z_]+` class stopped at the
  // first digit and returned null, so those rows were silently skipped by the evidence root and
  // the behaviour baseline. 工具名可含数字（如 `summarize_customer_360`）；旧字符集 `[a-z_]+`
  // 会在第一个数字处截断并返回 null，导致证据根 / 行为基线**静默跳过**这些行。
  const m = /^([a-z0-9_]+)\(/.exec(detail);
  return m ? m[1] : null;
}
