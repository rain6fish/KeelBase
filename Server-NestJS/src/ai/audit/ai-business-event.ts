// SPDX-License-Identifier: Apache-2.0

/**
 * §22.16 A-1 业务事件归一化（AI 侧）：AI 工具调用 → 业务事件名（CustomerRiskAssessed / FollowupTaskCreated 等）。
 * 目的：AI / Java / REST / MCP / DB 底层日志不同，审计人员看到的都是统一业务语言。
 * resultType 兜底（副作用目标类型），与 operation-audit/business-event.ts（REST 侧）互补。
 */

const TOOL_EVENTS: Record<string, string> = {
  analyze_customer_risk: 'CustomerRiskAssessed',
  analyze_project_risk: 'ProjectRiskAssessed',
  create_followup_task: 'FollowupTaskCreated',
  create_event: 'EventCreated',
  create_todo: 'TodoCreated',
  create_project_task: 'ProjectTaskCreated',
  create_contract: 'ContractCreated',
  submit_approval_request: 'ApprovalSubmitted',
  review_approval_request: 'ApprovalReviewed',
  update_customer_status: 'CustomerStatusUpdated',
};

/** 副作用 resultType → 业务事件名（AI 写工具 create 类兜底） */
const RESULT_TYPE_EVENTS: Record<string, string> = {
  event: 'EventCreated',
  crm_task: 'FollowupTaskCreated',
  pm_task: 'ProjectTaskCreated',
  app_request: 'ApprovalSubmitted',
  todo: 'TodoCreated',
  contract: 'ContractCreated',
};

/** 派生 AI 业务事件名：toolName 优先，resultType 兜底；无法归一返回 null。 */
export function deriveAiBusinessEvent(toolName?: string, resultType?: string): string | null {
  if (toolName && TOOL_EVENTS[toolName]) return TOOL_EVENTS[toolName];
  if (resultType && RESULT_TYPE_EVENTS[resultType]) return RESULT_TYPE_EVENTS[resultType];
  return null;
}
