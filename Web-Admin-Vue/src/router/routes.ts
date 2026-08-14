import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 允许访问的角色；缺省 = 任意已登录角色 */
    roles?: string[]
    public?: boolean
    requiresAuth?: boolean
    title?: string
  }
}

// 控制台（管理侧）：所有页面统一 admin-only，批量打标一处覆盖，未来新增页自动继承
const consoleChildren: RouteRecordRaw[] = [
  { path: '', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: 'overview' } },
  { path: 'users', name: 'users', component: () => import('@/views/users/UsersView.vue'), meta: { title: 'navUsers' } },
  { path: 'users/:id', name: 'user-detail', component: () => import('@/views/users/UserDetailView.vue'), meta: { title: 'navUsers' } },
  { path: 'events', name: 'events', component: () => import('@/views/events/EventsView.vue'), meta: { title: 'navEvents' } },
  { path: 'knowledge', name: 'knowledge', component: () => import('@/views/knowledge/KnowledgeView.vue'), meta: { title: 'navKnowledge' } },
  { path: 'notifications', name: 'notifications', component: () => import('@/views/notifications/NotificationsView.vue'), meta: { title: 'navNotifications' } },
  { path: 'monitor', name: 'monitor', component: () => import('@/views/monitor/MonitorView.vue'), meta: { title: 'navMonitorCenter' } },
  { path: 'audit', name: 'audit', component: () => import('@/views/audit/AiAuditView.vue'), meta: { title: 'navAiAudit' } },
  { path: 'op-audit', name: 'op-audit', component: () => import('@/views/op-audit/OpAuditView.vue'), meta: { title: 'navOpAudit' } },
  { path: 'sessions', name: 'sessions', component: () => import('@/views/sessions/SessionsView.vue'), meta: { title: 'navSessions' } },
  { path: 'observability', name: 'observability', component: () => import('@/views/observability/ObservabilityView.vue'), meta: { title: 'navObservability' } },
  { path: 'system', name: 'system', component: () => import('@/views/system/SystemView.vue'), meta: { title: 'navSystemInfo' } },
  // P3 新增
  { path: 'trash', name: 'trash', component: () => import('@/views/trash/TrashView.vue'), meta: { title: 'navTrash' } },
  { path: 'data-import', name: 'data-import', component: () => import('@/views/data-import/DataImportView.vue'), meta: { title: 'navDataImport' } },
  { path: 'tags', name: 'tags', component: () => import('@/views/tags/TagsView.vue'), meta: { title: 'navTags' } },
  { path: 'notes', name: 'notes', component: () => import('@/views/notes/NotesView.vue'), meta: { title: 'navNotes' } },
  { path: 'templates', name: 'templates', component: () => import('@/views/templates/TemplatesView.vue'), meta: { title: 'navTemplates' } },
  { path: 'ai-eval', name: 'ai-eval', component: () => import('@/views/ai-eval/AiEvalView.vue'), meta: { title: 'navAiEval' } },
  { path: 'ai-timeline', name: 'ai-timeline', component: () => import('@/views/ai-timeline/AiTimelineView.vue'), meta: { title: 'navAiTimeline' } },
  { path: 'ai-tools', name: 'ai-tools', component: () => import('@/views/ai-tools/AiToolsView.vue'), meta: { title: 'navAiTools' } },
  { path: 'analytics', name: 'analytics', component: () => import('@/views/analytics/AnalyticsView.vue'), meta: { title: 'navAnalytics' } },
]

for (const r of consoleChildren) {
  r.meta = { ...r.meta, roles: ['admin'] }
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
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      ...consoleChildren,
      // 工作台（应用侧）：普通企业用户；子页挂这里继承 roles
      {
        path: 'workbench',
        meta: { roles: ['user'] },
        children: [
          { path: '', name: 'workbench-home', component: () => import('@/views/workbench/WorkbenchHomeView.vue'), meta: { title: 'navWorkbench' } },
          { path: 'events', name: 'workbench-events', component: () => import('@/views/workbench/MyEventsView.vue'), meta: { title: 'workbenchMyEvents' } },
          { path: 'todos', name: 'workbench-todos', component: () => import('@/views/workbench/MyTodosView.vue'), meta: { title: 'workbenchMyTodos' } },
          { path: 'notifications', name: 'workbench-notifications', component: () => import('@/views/workbench/MyNotificationsView.vue'), meta: { title: 'workbenchNotifications' } },
        ],
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
