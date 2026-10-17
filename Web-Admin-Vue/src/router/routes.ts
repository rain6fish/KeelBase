// SPDX-License-Identifier: Apache-2.0

import type { RouteRecordRaw } from 'vue-router'
import { PERMISSIONS, type Permission } from '@/constants/permissions'

declare module 'vue-router' {
  interface RouteMeta {
    /** 允许访问的角色；缺省 = 任意已登录角色。能力清单不可用时作为回退门 */
    roles?: string[]
    public?: boolean
    requiresAuth?: boolean
    title?: string
    /** MOD-4：对应业务模块 id；模块被 capabilities 禁用时路由不可达 */
    module?: string
    /**
     * WEB-FRONT-2：能力裁决点。清单可用时按 `GET /auth/me/permissions` 的 subject+scope 判定，
     * 忽略 roles；清单不可用回退 roles（见 router/guards.ts）。留空 = 只按 roles。
     */
    permission?: Permission
  }
}

// 控制台（管理侧）：所有页面统一 admin-only，批量打标一处覆盖，未来新增页自动继承
const consoleChildren: RouteRecordRaw[] = [
  { path: '', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: 'overview' } },
  { path: 'users', name: 'users', component: () => import('@/views/users/UsersView.vue'), meta: { title: 'navUsers' } },
  { path: 'users/:id', name: 'user-detail', component: () => import('@/views/users/UserDetailView.vue'), meta: { title: 'navUsers' } },
  { path: 'events', name: 'events', component: () => import('@/views/events/EventsView.vue'), meta: { title: 'navEvents', module: 'events' } },
  { path: 'knowledge', name: 'knowledge', component: () => import('@/views/knowledge/KnowledgeView.vue'), meta: { title: 'navKnowledge' } },
  { path: 'notifications', name: 'notifications', component: () => import('@/views/notifications/NotificationsView.vue'), meta: { title: 'navNotifications' } },
  { path: 'monitor', name: 'monitor', component: () => import('@/views/monitor/MonitorView.vue'), meta: { title: 'navMonitorCenter' } },
  { path: 'ops', name: 'ops', component: () => import('@/views/ops/OpsView.vue'), meta: { title: 'opsTitle' } },
  { path: 'audit', name: 'audit', component: () => import('@/views/audit/AiAuditView.vue'), meta: { title: 'navAiAudit' } },
  { path: 'op-audit', name: 'op-audit', component: () => import('@/views/op-audit/OpAuditView.vue'), meta: { title: 'navOpAudit' } },
  { path: 'sessions', name: 'sessions', component: () => import('@/views/sessions/SessionsView.vue'), meta: { title: 'navSessions' } },
  { path: 'observability', name: 'observability', component: () => import('@/views/observability/ObservabilityView.vue'), meta: { title: 'navObservability' } },
  { path: 'system', name: 'system', component: () => import('@/views/system/SystemView.vue'), meta: { title: 'navSystemInfo' } },
  { path: 'permissions', name: 'permissions', component: () => import('@/views/permissions/PermissionsView.vue'), meta: { title: 'navPermissions' } },
  // P3 新增
  { path: 'trash', name: 'trash', component: () => import('@/views/trash/TrashView.vue'), meta: { title: 'navTrash' } },
  { path: 'data-import', name: 'data-import', component: () => import('@/views/data-import/DataImportView.vue'), meta: { title: 'navDataImport' } },
      { path: 'asset_loans', name: 'asset_loans', component: () => import('@/views/asset_loans/AssetLoansView.vue'), meta: { title: 'navAssetLoans', module: 'asset_loans' } },
      { path: 'points_ledgers', name: 'points_ledgers', component: () => import('@/views/points_ledgers/PointsLedgersView.vue'), meta: { title: 'navPointsLedgers', module: 'points_ledgers' } },
      { path: 'point_records', name: 'point_records', component: () => import('@/views/point_records/PointRecordsView.vue'), meta: { title: 'navPointRecords', module: 'point_records' } },
      { path: 'posts', name: 'posts', component: () => import('@/views/posts/PostsView.vue'), meta: { title: 'navPosts', module: 'posts' } },
      { path: 'books', name: 'books', component: () => import('@/views/books/BooksView.vue'), meta: { title: 'navBooks', module: 'books' } },
      { path: 'reports', name: 'reports', component: () => import('@/views/reports/ReportsView.vue'), meta: { title: 'navReports', module: 'reports' } },
      { path: 'followup_plans', name: 'followup_plans', component: () => import('@/views/followup_plans/FollowupPlansView.vue'), meta: { title: 'navFollowupPlans', module: 'followup_plans' } },
      { path: 'contracts', name: 'contracts', component: () => import('@/views/contracts/ContractsView.vue'), meta: { title: 'navContracts', module: 'contracts' } },
      { path: 'suppliers', name: 'suppliers', component: () => import('@/views/suppliers/SuppliersView.vue'), meta: { title: 'navSuppliers', module: 'suppliers' } },
  { path: 'tags', name: 'tags', component: () => import('@/views/tags/TagsView.vue'), meta: { title: 'navTags', module: 'tags' } },
  { path: 'notes', name: 'notes', component: () => import('@/views/notes/NotesView.vue'), meta: { title: 'navNotes', module: 'notes' } },
  { path: 'templates', name: 'templates', component: () => import('@/views/templates/TemplatesView.vue'), meta: { title: 'navTemplates' } },
  { path: 'ai-eval', name: 'ai-eval', component: () => import('@/views/ai-eval/AiEvalView.vue'), meta: { title: 'navAiEval' } },
  { path: 'ai-behavior', name: 'ai-behavior', component: () => import('@/views/guard/AiBehaviorView.vue'), meta: { title: 'navAiBehavior' } },
  { path: 'ai-timeline', name: 'ai-timeline', component: () => import('@/views/ai-timeline/AiTimelineView.vue'), meta: { title: 'navAiTimeline' } },
  { path: 'ai-tools', name: 'ai-tools', component: () => import('@/views/ai-tools/AiToolsView.vue'), meta: { title: 'navAiTools' } },
  { path: 'ai-approvals', name: 'ai-approvals', component: () => import('@/views/ai-approvals/AiApprovalsView.vue'), meta: { title: 'navAiApprovals' } },
  { path: 'security-review', name: 'security-review', component: () => import('@/views/security-review/SecurityReviewView.vue'), meta: { title: 'navSecurityReview' } },
  { path: 'security-showcase', name: 'security-showcase', component: () => import('@/views/security-showcase/SecurityShowcaseView.vue'), meta: { title: 'navSecurityShowcase' } },
  { path: 'guard-overview', name: 'guard-overview', component: () => import('@/views/guard/GuardOverviewView.vue'), meta: { title: 'navGuardOverview' } },
  { path: 'risk', name: 'risk', component: () => import('@/views/risk/RiskView.vue'), meta: { title: 'navRisk' } },
  { path: 'agent-registry', name: 'agent-registry', component: () => import('@/views/agents/AgentRegistryView.vue'), meta: { title: 'navAgents' } },
  { path: 'policy-center', name: 'policy-center', component: () => import('@/views/policy/PolicyCenterView.vue'), meta: { title: 'navPolicyCenter' } },
  { path: 'mcp', name: 'mcp', component: () => import('@/views/mcp/McpView.vue'), meta: { title: 'navMcp' } },
  { path: 'analytics', name: 'analytics', component: () => import('@/views/analytics/AnalyticsView.vue'), meta: { title: 'navAnalytics' } },
  { path: 'org', name: 'org', component: () => import('@/views/org/OrgView.vue'), meta: { title: 'navOrg', module: 'org' } },
  // System AI Assistant（管理端 AI 助手）
  { path: 'system-ai-assistant', name: 'system-ai-assistant', component: () => import('@/views/ai-assistant/SystemAiAssistantView.vue'), meta: { title: 'navSystemAssistant' } },
]

// The console is admin-only by default. The audit reader (AW-2) gets exactly the pages whose backend
// it can actually read — everything else would be "clickable, then 403".
// 控制台默认只给 admin。审计读者（AW-2）只拿到它**后端真的读得到**的那几页 —— 多放一页就会变成
// 「点得进、点开 403」。这张表与后端判据同步（`BUILTIN_ROLE_RULES` 的 auditor 规则）。
//
// The six governance reads opened on 2026-10-17 live on three pages that also carry admin-only
// affordances. The pages are reachable; the shell tells them they are read-only (`CONSOLE_READ_ONLY`
// provided by `AdminLayout.vue`), so the editing / approving / retrying controls never render for an
// auditor. Reaching a page is not ruling on it — the write doors stay 403 at the backend either way.
// 2026-10-17 开放的六个治理读面落在三张同时带管理员专属操作的页上。页可达，但壳会告诉它们当前是
// 只读（`AdminLayout.vue` 提供 `CONSOLE_READ_ONLY`），保存 / 批准 / 重试这些控件对审计读者不渲染。
// 进得去不等于裁得了 —— 无论前端如何，写门在后端照旧 403。
export const AUDITOR_PAGES = new Set(['audit', 'policy-center', 'ai-tools', 'ai-approvals'])

for (const r of consoleChildren) {
  const roles = AUDITOR_PAGES.has(r.name as string) ? ['admin', 'auditor'] : ['admin']
  r.meta = { ...r.meta, roles }
}

// 双 surface 构建：`--mode user` 只含普通用户工作台路由，其余（admin/development）只含控制台路由
const SURFACE: 'user' | 'admin' = import.meta.env.MODE === 'user' ? 'user' : 'admin'

// 工作台（应用侧）：普通企业用户；子页挂这里继承 roles
const workbenchRoute: RouteRecordRaw = {
  path: 'workbench',
  meta: { roles: ['user'] },
  children: [
    // P1：聊天是**新增的**登录落点（见 guards.ts homeFor）。工作台首页与其余页面原样保留，
    // 左侧菜单一项不少——聊天是入口，不是唯一的门。
    { path: 'ai', name: 'workbench-ai', component: () => import('@/views/workbench/AiChatView.vue'), meta: { title: 'aiAssistant' } },
    { path: '', name: 'workbench-home', component: () => import('@/views/workbench/WorkbenchHomeView.vue'), meta: { title: 'navWorkbench' } },
    { path: 'events', name: 'workbench-events', component: () => import('@/views/workbench/MyEventsView.vue'), meta: { title: 'workbenchMyEvents' } },
    { path: 'todos', name: 'workbench-todos', component: () => import('@/views/workbench/MyTodosView.vue'), meta: { title: 'workbenchMyTodos', permission: PERMISSIONS.TODO_MANAGE } },
    { path: 'notifications', name: 'workbench-notifications', component: () => import('@/views/workbench/MyNotificationsView.vue'), meta: { title: 'workbenchNotifications' } },
    // P0-1 评审路径：Trust 旅程链条（沙盘六场景 → 执行轨迹 → 业务动作治理详情）对 admin 放开，
    // 使 admin 在控制台壳内一次点击即达（其余工作台页仍限 user，评审默认不落地日常业务）
    { path: 'ai-trace', name: 'workbench-ai-trace', component: () => import('@/views/workbench/AiTraceView.vue'), meta: { title: 'aiTraceTitle', roles: ['user', 'admin'] } },
    { path: 'trust-sandbox', name: 'workbench-trust-sandbox', component: () => import('@/views/workbench/TrustSandboxView.vue'), meta: { title: 'trustSandboxTitle', roles: ['user', 'admin'] } },
    { path: 'my-ai-actions', name: 'workbench-my-ai-actions', component: () => import('@/views/workbench/MyAiActionCenterView.vue'), meta: { title: 'aiCenterTitle' } },
    { path: 'action/:resultType/:resultId', name: 'workbench-action-detail', component: () => import('@/views/workbench/BusinessActionDetailView.vue'), meta: { title: 'workbenchActionDetail', roles: ['user', 'admin'] } },
    { path: 'org', name: 'workbench-org', component: () => import('@/views/workbench/OrgDirectoryView.vue'), meta: { title: 'workbenchOrgDir' } },
    { path: 'crm', name: 'workbench-crm', component: () => import('@/views/workbench/CrmCustomersView.vue'), meta: { title: 'crmTitle', permission: PERMISSIONS.CRM_VIEW } },
    { path: 'crm/:id', name: 'workbench-crm-detail', component: () => import('@/views/workbench/CrmCustomerDetailView.vue'), meta: { title: 'crmTitle', permission: PERMISSIONS.CRM_VIEW } },
    { path: 'crm-dashboard', name: 'workbench-crm-dashboard', component: () => import('@/views/workbench/CrmDashboardView.vue'), meta: { title: 'aiIntelligence', permission: PERMISSIONS.CRM_VIEW } },
    { path: 'pm', name: 'workbench-pm', component: () => import('@/views/workbench/PmProjectsView.vue'), meta: { title: 'pmTitle', permission: PERMISSIONS.PM_VIEW } },
    { path: 'pm/:id', name: 'workbench-pm-detail', component: () => import('@/views/workbench/PmProjectDetailView.vue'), meta: { title: 'pmTitle', permission: PERMISSIONS.PM_VIEW } },
    { path: 'approval', name: 'workbench-approval', component: () => import('@/views/workbench/ApprovalRequestsView.vue'), meta: { title: 'apTitle', permission: PERMISSIONS.APPROVAL_MANAGE } },
    { path: 'approval/:id', name: 'workbench-approval-detail', component: () => import('@/views/workbench/ApprovalRequestDetailView.vue'), meta: { title: 'apTitle', permission: PERMISSIONS.APPROVAL_MANAGE } },
    { path: 'flows', name: 'workbench-flows', component: () => import('@/views/workbench/FlowInstancesView.vue'), meta: { title: 'workbenchFlows' } },
    { path: 'flows/:id', name: 'workbench-flow-detail', component: () => import('@/views/workbench/FlowInstanceDetailView.vue'), meta: { title: 'workbenchFlows' } },
  ],
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/403/ForbiddenView.vue'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/auth/oidc/callback',
    name: 'oidc-callback',
    component: () => import('@/views/login/OidcCallbackView.vue'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    // user 构建无 dashboard 空路径子路由，直接落地工作台 AI 页；admin 构建 '/' = dashboard
    // 同一壳两套导航（WEB-FRONT-1）：admin 构建也并入工作台路由，普通用户登录进工作台（不再 403）
    redirect: SURFACE === 'user' ? '/workbench/ai' : undefined,
    children: SURFACE === 'user' ? [workbenchRoute] : [...consoleChildren, workbenchRoute],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
