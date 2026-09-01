// SPDX-License-Identifier: Apache-2.0

/**
 * A-1 业务事件归一化：把 method + path 归一为「业务事件名」（如 CustomerUpdated / FollowupTaskCreated）。
 * 目的：跨系统（Java / REST / MCP / DB / Node）底层日志不同，审计人员看到的都是统一业务语言。
 */

const ACTION_SUFFIX: Record<string, string> = {
  POST: 'Created',
  PATCH: 'Updated',
  PUT: 'Updated',
  DELETE: 'Deleted',
};

/** 资源路径 → 业务实体名（按优先级匹配，先精确后兜底） */
const RESOURCES: Array<[RegExp, string]> = [
  [/\/crm\/customers\/\d+\/opportunities/, 'CustomerOpportunity'],
  [/\/crm\/customers\/\d+\/contacts/, 'CustomerContact'],
  [/\/crm\/customers\/\d+\/risks/, 'CustomerRisk'],
  [/\/crm\/customers\/\d+\/orders/, 'CustomerOrder'],
  [/\/crm\/customers\/\d+\/activities/, 'CustomerActivity'],
  [/\/org\/organizations\/\d+\/invites/, 'OrganizationInvite'],
  [/\/org\/organizations\/\d+\/members/, 'OrganizationMember'],
  [/\/org\/organizations\/\d+\/departments/, 'Department'],
  [/\/crm\/customers/, 'Customer'],
  [/\/crm\/tasks/, 'FollowupTask'],
  [/\/crm\/orders/, 'CustomerOrder'],
  [/\/crm\/activities/, 'CustomerActivity'],
  [/\/crm\/opportunities/, 'CustomerOpportunity'],
  [/\/crm\/contacts/, 'CustomerContact'],
  [/\/crm\/risks/, 'CustomerRisk'],
  [/\/pm\/projects/, 'Project'],
  [/\/pm\/milestones/, 'ProjectMilestone'],
  [/\/pm\/tasks/, 'ProjectTask'],
  [/\/approval\/requests/, 'ApprovalRequest'],
  [/\/approval\/policies/, 'ApprovalPolicy'],
  [/\/contracts/, 'Contract'],
  [/\/suppliers/, 'Supplier'],
  [/\/tags/, 'Tag'],
  [/\/notes/, 'Note'],
  [/\/books/, 'Book'],
  [/\/posts/, 'Post'],
  [/\/events/, 'Event'],
  [/\/todos/, 'Todo'],
  [/\/users/, 'User'],
  [/\/org\/organizations/, 'Organization'],
  [/\/org\/departments/, 'Department'],
  [/\/org\/members/, 'Member'],
  [/\/org\/invites/, 'OrganizationInvite'],
  [/\/org\/requests/, 'OrganizationRequest'],
];

/** 非业务事件路径（基础设施/平台管理，不作为业务行为留痕） */
const NON_BUSINESS: Array<RegExp> = [
  /\/auth\//,
  /\/ai\//,
  /\/upload/,
  /\/notifications/,
  /\/settings/,
  /\/push\//,
  /\/webhooks/,
  /\/points\//,
  /\/admin\//,
  /\/health/,
  /\/metrics/,
  /\/search/,
  /\/forms\//,
  /\/plugins\//,
  /\/mcp/,
  /\/external\//,
  /\/internal\//,
];

export function deriveBusinessEvent(path: string, method: string): string | null {
  const p = path.split('?')[0];
  const suffix = ACTION_SUFFIX[method.toUpperCase()];
  if (!suffix) return null;
  for (const re of NON_BUSINESS) if (re.test(p)) return null;
  for (const [re, name] of RESOURCES) if (re.test(p)) return `${name}${suffix}`;
  return null;
}
