import type { RouteRecordRaw } from 'vue-router'

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
      { path: 'templates', name: 'templates', component: () => import('@/views/templates/TemplatesView.vue'), meta: { title: 'navTemplates' } },
      { path: 'ai-eval', name: 'ai-eval', component: () => import('@/views/ai-eval/AiEvalView.vue'), meta: { title: 'navAiEval' } },
      { path: 'ai-tools', name: 'ai-tools', component: () => import('@/views/ai-tools/AiToolsView.vue'), meta: { title: 'navAiTools' } },
      { path: 'analytics', name: 'analytics', component: () => import('@/views/analytics/AnalyticsView.vue'), meta: { title: 'navAnalytics' } },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
