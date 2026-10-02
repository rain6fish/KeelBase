// SPDX-License-Identifier: Apache-2.0

/**
 * One table of what each tool *means* in business language, and the views derived from it.
 *
 * Two tables expressed the same tools and had drifted: `ai-feature-map`'s TOOL_LABELS carried labels
 * for four names that no tool has (`query_contacts`, `query_opportunities`, `query_user_stats`,
 * `summarize_customer` — the real tools are `query_customer_contacts`,
 * `query_customer_opportunities`, `get_user_stats`, `summarize_customer_360`), while twelve real
 * tools had no label at all; and `ai-business-event`'s TOOL_EVENTS was a second, hand-maintained
 * list of the same tools, overlapping but not equal.
 *
 * So the facts live here once, keyed by tool name — and the i18n key is **derived**
 * (`ai.tool.<camelCase(name)>`), never written down, because a hand-written key is one more thing
 * that can disagree with the name it sits next to.
 *
 * 一张表说明每个工具在业务语言里**是什么**，各消费方从中派生。
 *
 * 过去两张表表达同一批工具，且已漂移：`ai-feature-map` 的 TOOL_LABELS 给四个**不存在**的工具名
 * 留了标签（`query_contacts` / `query_opportunities` / `query_user_stats` / `summarize_customer`
 * —— 真名是 `query_customer_contacts` / `query_customer_opportunities` / `get_user_stats` /
 * `summarize_customer_360`），而有 **12 个真工具没有标签**；`ai-business-event` 的 TOOL_EVENTS
 * 是同一批工具的第二份手抄，有重叠但不相等。
 *
 * 所以事实只此一份、按工具名索引 —— 而 i18n key **机械派生**（`ai.tool.<camelCase(工具名)>`），
 * 不写下来：手写的 key 只是又一个可能与它旁边的工具名对不上的东西。
 */

export interface ToolMetadata {
  /** 英文兜底标签（前端没有对应 i18n 条目时显示）。 */
  label: string;
  /** 该工具写成的业务事件名；只读工具没有。 */
  event?: string;
  /**
   * 本仓**未注册**的工具名（B 路径代理 / 外部系统）—— 名字由对方定义。
   * 完备性闸只对未标记项断言「必须是已注册工具」，标记项免检（否则会把真实的外部工具判成死条目）。
   */
  external?: true;
}

export const TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = {
  // AI CRM
  query_customers: { label: 'Query customers' },
  query_customer_orders: { label: 'Query customer orders' },
  query_customer_activities: { label: 'Query customer activities' },
  query_customer_contacts: { label: 'Query contacts' },
  query_customer_opportunities: { label: 'Query opportunities' },
  summarize_customer_360: { label: 'Summarize customer' },
  analyze_customer_risk: { label: 'Analyze customer risk', event: 'CustomerRiskAssessed' },
  analyze_sales_pipeline: { label: 'Analyze sales pipeline' },
  detect_idle_customers: { label: 'Detect idle customers' },
  create_followup_task: { label: 'Create follow-up task', event: 'FollowupTaskCreated' },
  create_followup_plan: { label: 'Create follow-up plan' },
  query_followup_plans: { label: 'Query follow-up plans' },
  delete_customer: { label: 'Delete customer' },
  // AI Project
  query_projects: { label: 'Query projects' },
  query_project_tasks: { label: 'Query project tasks' },
  analyze_project_risk: { label: 'Analyze project risk', event: 'ProjectRiskAssessed' },
  create_project_task: { label: 'Create project task', event: 'ProjectTaskCreated' },
  create_project_with_tasks: { label: 'Create project with tasks' },
  // AI Approval
  query_approval_requests: { label: 'Query approval requests' },
  query_approval_policies: { label: 'Query approval policies' },
  submit_approval_request: { label: 'Submit approval request', event: 'ApprovalSubmitted' },
  review_approval_request: { label: 'Review approval request', event: 'ApprovalReviewed' },
  // 通用 / general
  query_events: { label: 'Query events' },
  query_events_by_keyword: { label: 'Search events' },
  count_events_by_status: { label: 'Count events by status' },
  create_event: { label: 'Create event', event: 'EventCreated' },
  create_todo: { label: 'Create todo', event: 'TodoCreated' },
  get_user_stats: { label: 'Query user stats' },
  query_org_members: { label: 'Query org members' },
  query_org_tasks: { label: 'Query org tasks' },
  query_org_availability: { label: 'Check availability' },
  query_contracts: { label: 'Query contracts' },
  create_contract: { label: 'Create contract', event: 'ContractCreated' },
  query_reports: { label: 'Query reports' },
  create_report: { label: 'Create report' },
  // 生成模块与导航 / generated module and navigation
  create_module: { label: 'Create module' },
  create_module_apply: { label: 'Apply generated module' },
  navigate_page: { label: 'Navigate page' },
  navigate_admin_page: { label: 'Navigate admin page' },
  web_search: { label: 'Web search' },
  generate_image: { label: 'Generate image' },
  // 外部（B 路径代理）：名字来自目标系统，本仓不注册
  update_customer_status: { label: 'Update customer status', event: 'CustomerStatusUpdated', external: true },
};

/** `create_followup_task` → `createFollowupTask`（与前端 `toolKey` 同一约定）。 */
export function toolLabelKey(toolName: string): string {
  return `ai.tool.${toolName.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}
