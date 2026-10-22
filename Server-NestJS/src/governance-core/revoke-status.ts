// SPDX-License-Identifier: Apache-2.0

/**
 * The `ai_tool_side_effects.revoke_status` vocabulary — **one declaration**.
 *
 * The values were string literals at every reader, writer and query before this file existed: a
 * change to the set meant finding every one of them, and a missed site stayed green. They are now
 * a single table with the union derived from it (the same shape `CONFIRMATION_STATUS` /
 * `WRITE_CLAIM_STATUS` already use), so dropping a value fails to compile at every use rather than
 * silently widening. `null` is not a member: the column is nullable and means "not revoked".
 *
 * `ai_tool_side_effects.revoke_status` 的词表 —— **一份声明**。
 *
 * 本文件存在之前，这些值是散在每个读侧、写侧与查询里的字符串字面量：改一次取值集就得把它们全找出来，
 * 漏掉一处也照样是绿的。现在它是一张表、联合类型由它派生（与既有的 `CONFIRMATION_STATUS` /
 * `WRITE_CLAIM_STATUS` 同形），删掉一个取值会在每一处使用上编译失败，而不是悄悄放宽。`null` 不在
 * 取值集里：该列可空，`null` 的语义是「未撤销」。
 */
export const REVOKE_STATUS = {
  /** The target was compensated (locally soft-deleted, or the external system confirmed the undo). */
  REVOKED: 'revoked',
  /** A compensation was requested and its outcome is not known — never read as "not revoked". */
  COMPENSATING: 'compensating',
  /** A compensation ran and failed; it may be retried. */
  REVOKE_FAILED: 'revoke_failed',
} as const;

/**
 * The union derived from the table above, so the value set and its type have one source.
 * 由上面的表派生的联合类型，使「取值集」与「其类型」共用同一个来源。
 */
export type RevokeStatus = (typeof REVOKE_STATUS)[keyof typeof REVOKE_STATUS];
