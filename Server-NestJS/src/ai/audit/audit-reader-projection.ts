// SPDX-License-Identifier: Apache-2.0

import { UserRole } from '../../common/entities/user.entity';
import type { AiAuditLog } from './ai-audit-log.entity';
import type { AiAuditLogWithUser } from './audit-query.service';

/**
 * The audit reader's field whitelist — **one declaration**, and the projection is built *from* it.
 *
 * Fail-closed is a property of the construction, not of a reviewer: `projectRow` writes only the keys
 * named here, so a column added to `AiAuditLogWithUser` tomorrow is invisible to an audit reader
 * until someone deliberately adds it to this list. Deleting from a full row would fail open instead —
 * the next column would leak by default.
 *
 * Deliberately absent, and why:
 * - `conversationId` — a pointer into a person's conversation. The reader audits the record, not the
 *   conversation, and has no endpoint to follow the pointer anyway.
 * - `ip` / `guestId` / `deviceId` — client attribution identifiers. They bind activity to a device or
 *   a person and are not needed to judge a governance decision.
 * - `feedback` / `feedbackNote` — the user's own comment about the assistant, not the audit record.
 * - `delegationContext` — free-form text that may quote a prompt. The bounded `businessIntent` plus
 *   the agent / caller ids carry the attribution the reader actually needs.
 *
 * ⚠ Not covered by this whitelist: the signed evidence package (`/audit/action-report/export`) and
 * the `verify` chain payload. Those are verification artifacts whose value *is* the complete canonical
 * payload — projecting them would make them unverifiable. This module covers **row-shaped responses**
 * (the log list and the row embedded in the single-event explanation).
 *
 * 审计读者的字段白名单 —— **一处声明**，而投影是由它**重建**出来的。
 *
 * fail-closed 是这个构造方式的性质，不是审阅者的记性：`projectRow` 只写这里点名的键，于是明天
 * 给 `AiAuditLogWithUser` 加的列，在有人**有意**把它加进本清单之前，审计读者**看不到**它。
 * 反过来「从整行里删掉不许看的字段」会 fail-open —— 下一个新列默认就漏了。
 *
 * 有意不在这里的字段与理由：
 * - `conversationId` —— 指向某个人的对话。读者审计的是记录，不是对话，而且他也没有端点能跟过去。
 * - `ip` / `guestId` / `deviceId` —— 客户端归因标识。它们把活动绑到一台设备或一个人身上，
 *   判断一次治理决策并不需要它们。
 * - `feedback` / `feedbackNote` —— 用户对助手自己的评论，不是审计记录。
 * - `delegationContext` —— 自由文本，可能引用提示词。有界的 `businessIntent` 与 agent / caller
 *   标识已经带上了读者真正需要的归因。
 *
 * ⚠ 本白名单**不覆盖**签名证据包（`/audit/action-report/export`）与 `verify` 的链载荷。它们是
 * **核验物**，价值就在完整的 canonical 载荷上 —— 投影掉它就没法验了。本模块覆盖的是**行形状的
 * 响应**（日志列表，以及单事件解释里内嵌的那一行）。
 */
export const AUDIT_READER_ROW_FIELDS = [
  'id',
  'userId',
  'username',
  'action',
  'actionKey',
  'actionLabel',
  'detail',
  'agentId',
  'parentActionId',
  'callerAgentId',
  'businessIntent',
  'source',
  'outcome',
  'tool',
  'model',
  'provider',
  'promptTokens',
  'completionTokens',
  'durationMs',
  'isError',
  'errorMessage',
  'authorization',
  'createdAt',
  'businessEvent',
  'evidence',
] as const satisfies ReadonlyArray<keyof AiAuditLogWithUser>;

/**
 * The row embedded in `GET /audit/logs/:id/interpretation`. It is the entity, not the wire row, so it
 * has its own list — and `hash` / `prevHash` stay in it: the view reads the row's **chain position**
 * from them, and they are evidence rather than personal data.
 *
 * 单事件解释（`GET /audit/logs/:id/interpretation`）里内嵌的那一行。它是实体、不是线上行，故另有一份
 * 清单 —— 而 `hash` / `prevHash` 留在里面：视图从它们读该行的**链位**，且它们是证据、不是个人数据。
 */
export const AUDIT_READER_ENTITY_FIELDS = [
  'id',
  'userId',
  'username',
  'action',
  'detail',
  'agentId',
  'parentActionId',
  'callerAgentId',
  'businessIntent',
  'source',
  'outcome',
  'tool',
  'model',
  'provider',
  'promptTokens',
  'completionTokens',
  'durationMs',
  'isError',
  'errorMessage',
  'authorization',
  'businessEvent',
  'evidence',
  'createdAt',
  'prevHash',
  'hash',
] as const satisfies ReadonlyArray<keyof AiAuditLog>;

/** Copy only the named keys that are present. Absent keys stay absent (no `undefined` padding). */
function pick<T extends Record<string, unknown>>(
  source: T,
  fields: readonly (keyof T & string)[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const field of fields) {
    if (field in source) out[field] = source[field];
  }
  return out;
}

/** Project one wire row for an audit reader. Admins are not projected (unchanged behaviour). */
export function projectAuditRowForReader(row: AiAuditLogWithUser): Partial<AiAuditLogWithUser> {
  return pick(row as unknown as Record<string, unknown>, AUDIT_READER_ROW_FIELDS) as Partial<AiAuditLogWithUser>;
}

/** Project one entity row (the explanation's `row`) for an audit reader. */
export function projectAuditEntityForReader(row: AiAuditLog): Partial<AiAuditLog> {
  return pick(row as unknown as Record<string, unknown>, AUDIT_READER_ENTITY_FIELDS) as Partial<AiAuditLog>;
}

/**
 * The role-aware entry point for the log list. Only `admin` keeps the full row; every other caller —
 * including an unexpected role or a missing one — gets the whitelist, because the safe answer to
 * "who is this?" is the narrower projection.
 *
 * 日志列表的角色入口。只有 `admin` 保留整行；其他一切调用者 —— 包括意料之外的角色或缺席的角色 ——
 * 都拿白名单，因为「这是谁？」这个问题的安全答案就是更窄的那种投影。
 */
export function projectAuditRowsForCaller<T extends AiAuditLogWithUser>(
  rows: T[],
  role: UserRole | undefined,
): Array<Partial<T>> {
  if (role === UserRole.ADMIN) return rows;
  return rows.map((row) => projectAuditRowForReader(row) as Partial<T>);
}

/** Role-aware entry point for the explanation's embedded row. Same rule as the list. */
export function projectAuditEntityForCaller(
  row: AiAuditLog,
  role: UserRole | undefined,
): Partial<AiAuditLog> {
  return role === UserRole.ADMIN ? row : projectAuditEntityForReader(row);
}
