// SPDX-License-Identifier: Apache-2.0

/**
 * §internal.16 A-1 业务事件归一化（AI 侧）：AI 工具调用 → 业务事件名（CustomerRiskAssessed / FollowupTaskCreated 等）。
 * 目的：AI / Java / REST / MCP / DB 底层日志不同，审计人员看到的都是统一业务语言。
 * resultType 兜底（副作用目标类型），与 operation-audit/business-event.ts（REST 侧）互补。
 */

import { TOOL_METADATA } from './tool-metadata';

/**
 * 工具名 → 业务事件名。派生自 `tool-metadata.ts` 的单一表 —— 此前它是同一批工具的**第二份手抄**，
 * 与标签表有重叠但不相等（本表 10 条、标签表 30 余条），两边各自增删即漂移。
 */
const TOOL_EVENTS: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_METADATA)
    .filter(([, meta]) => meta.event)
    .map(([name, meta]) => [name, meta.event as string]),
);

/** 副作用 resultType → 业务事件名（AI 写工具 create 类兜底） */
const RESULT_TYPE_EVENTS: Record<string, string> = {
  event: 'EventCreated',
  crm_task: 'FollowupTaskCreated',
  pm_task: 'ProjectTaskCreated',
  app_request: 'ApprovalSubmitted',
  todo: 'TodoCreated',
  contract: 'ContractCreated',
  book: 'BookCreated',
  note: 'NoteCreated',
  post: 'PostCreated',
  supplier: 'SupplierCreated',
  tag: 'TagCreated',
};

/** 派生 AI 业务事件名：toolName 优先，resultType 兜底；无法归一返回 null。 */
export function deriveAiBusinessEvent(toolName?: string, resultType?: string): string | null {
  if (toolName && TOOL_EVENTS[toolName]) return TOOL_EVENTS[toolName];
  if (resultType && RESULT_TYPE_EVENTS[resultType]) return RESULT_TYPE_EVENTS[resultType];
  return null;
}
