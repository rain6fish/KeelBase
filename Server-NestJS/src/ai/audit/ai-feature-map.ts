/**
 * AI 审计「人类可读动作」映射（roadmap §22.10 D2：人类语言审计标签）。
 *
 * 复用操作审计 feature-map.ts 的思路（语义 key + fallback，前端按语言渲染），
 * 扩到 AI 审计：把技术 action 枚举（chat / tool_call / …）映射为人类可读描述，
 * 并从 detail 提取工具名附加（「AI · Tool call · create_followup_task」）。
 * 原则 3：审计要能看懂「AI 做了什么」，而不只是技术枚举值。
 */

export interface AiActionLabel {
  /** 语义 key（前端 i18n 用），如 ai.toolCall */
  key: string;
  /** 兜底英文描述（前端无 i18n 条目时显示），如 AI · Tool call */
  fallback: string;
}

/** AI 审计 action 枚举 → 语义 key + fallback。未命中的 action 走兜底（ai.<action>）。 */
const ACTION_LABELS: Record<string, AiActionLabel> = {
  chat: { key: 'ai.chat', fallback: 'AI · Chat' },
  tool_call: { key: 'ai.toolCall', fallback: 'AI · Tool call' },
  tool_confirmation: { key: 'ai.confirmation', fallback: 'AI · Confirmation' },
  navigate: { key: 'ai.navigate', fallback: 'AI · Navigate page' },
  plan: { key: 'ai.plan', fallback: 'AI · Plan' },
  analyze: { key: 'ai.analyze', fallback: 'AI · Analyze' },
  knowledge: { key: 'ai.knowledge', fallback: 'AI · Knowledge' },
  delegate: { key: 'ai.delegate', fallback: 'AI · Delegate' },
  flow_node: { key: 'ai.flowNode', fallback: 'AI · Flow node' },
  login: { key: 'ai.login', fallback: 'AI · Login' },
  error: { key: 'ai.error', fallback: 'AI · Error' },
  content_blocked: { key: 'ai.contentBlocked', fallback: 'AI · Content blocked' },
};

/** AI 工具名 → 人类可读标签（D2 工具名级映射：create_followup_task → Create follow-up task）。 */
const TOOL_LABELS: Record<string, AiActionLabel> = {
  create_followup_task: { key: 'ai.tool.createFollowupTask', fallback: 'Create follow-up task' },
  create_event: { key: 'ai.tool.createEvent', fallback: 'Create event' },
  create_todo: { key: 'ai.tool.createTodo', fallback: 'Create todo' },
  create_contract: { key: 'ai.tool.createContract', fallback: 'Create contract' },
  create_project_task: { key: 'ai.tool.createProjectTask', fallback: 'Create project task' },
  create_module: { key: 'ai.tool.createModule', fallback: 'Create module' },
  query_customers: { key: 'ai.tool.queryCustomers', fallback: 'Query customers' },
  query_customer_orders: { key: 'ai.tool.queryCustomerOrders', fallback: 'Query customer orders' },
  query_customer_activities: { key: 'ai.tool.queryCustomerActivities', fallback: 'Query customer activities' },
  query_contacts: { key: 'ai.tool.queryContacts', fallback: 'Query contacts' },
  query_opportunities: { key: 'ai.tool.queryOpportunities', fallback: 'Query opportunities' },
  query_contracts: { key: 'ai.tool.queryContracts', fallback: 'Query contracts' },
  query_projects: { key: 'ai.tool.queryProjects', fallback: 'Query projects' },
  query_project_tasks: { key: 'ai.tool.queryProjectTasks', fallback: 'Query project tasks' },
  query_events: { key: 'ai.tool.queryEvents', fallback: 'Query events' },
  query_events_by_keyword: { key: 'ai.tool.queryEventsByKeyword', fallback: 'Search events' },
  query_org_members: { key: 'ai.tool.queryOrgMembers', fallback: 'Query org members' },
  query_org_tasks: { key: 'ai.tool.queryOrgTasks', fallback: 'Query org tasks' },
  query_org_availability: { key: 'ai.tool.queryOrgAvailability', fallback: 'Check availability' },
  query_approval_requests: { key: 'ai.tool.queryApprovalRequests', fallback: 'Query approval requests' },
  query_approval_policies: { key: 'ai.tool.queryApprovalPolicies', fallback: 'Query approval policies' },
  query_user_stats: { key: 'ai.tool.queryUserStats', fallback: 'Query user stats' },
  analyze_customer_risk: { key: 'ai.tool.analyzeCustomerRisk', fallback: 'Analyze customer risk' },
  analyze_project_risk: { key: 'ai.tool.analyzeProjectRisk', fallback: 'Analyze project risk' },
  analyze_sales_pipeline: { key: 'ai.tool.analyzeSalesPipeline', fallback: 'Analyze sales pipeline' },
  summarize_customer: { key: 'ai.tool.summarizeCustomer', fallback: 'Summarize customer' },
  count_events_by_status: { key: 'ai.tool.countEventsByStatus', fallback: 'Count events by status' },
  generate_image: { key: 'ai.tool.generateImage', fallback: 'Generate image' },
  web_search: { key: 'ai.tool.webSearch', fallback: 'Web search' },
  review_approval_request: { key: 'ai.tool.reviewApprovalRequest', fallback: 'Review approval request' },
  submit_approval_request: { key: 'ai.tool.submitApprovalRequest', fallback: 'Submit approval request' },
  navigate_page: { key: 'ai.tool.navigatePage', fallback: 'Navigate page' },
  navigate_admin_page: { key: 'ai.tool.navigateAdminPage', fallback: 'Navigate admin page' },
};

/** detail 提取工具名：兼容 `toolName({args})`（实际格式）与 `Tool: toolName`。 */
function extractToolName(detail: string): string | null {
  const direct = detail.match(/^([a-z][a-z0-9_]+)\(/);
  if (direct) return direct[1];
  const prefixed = detail.match(/\bTool:\s*([a-z][a-z0-9_]+)/i);
  return prefixed ? prefixed[1] : null;
}

export function aiActionLabel(action: string, detail?: string | null): AiActionLabel {
  const base = ACTION_LABELS[action] ?? {
    key: `ai.${action}`,
    fallback: `AI · ${action}`,
  };
  if (!detail) return base;
  const tool = extractToolName(detail);
  if (tool && TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  if (tool) return { key: base.key, fallback: `${base.fallback} · ${tool}` };
  return base;
}
