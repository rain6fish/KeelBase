// SPDX-License-Identifier: Apache-2.0

import { createHashRouter, Navigate, Outlet } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import AdminLayout from '@/layouts/AdminLayout'
import LoginView from '@/views/login/LoginView'
import ForbiddenView from '@/views/403/ForbiddenView'
import DashboardView from '@/views/dashboard/DashboardView'
import UsersView from '@/views/users/UsersView'
import UserDetailView from '@/views/users/UserDetailView'
import EventsView from '@/views/events/EventsView'
import KnowledgeView from '@/views/knowledge/KnowledgeView'
import NotificationsView from '@/views/notifications/NotificationsView'
import MonitorView from '@/views/monitor/MonitorView'
import AiAuditView from '@/views/audit/AiAuditView'
import OpAuditView from '@/views/op-audit/OpAuditView'
import SessionsView from '@/views/sessions/SessionsView'
import ObservabilityView from '@/views/observability/ObservabilityView'
import SystemView from '@/views/system/SystemView'
import TrashView from '@/views/trash/TrashView'
import DataImportView from '@/views/data-import/DataImportView'
import TagsView from '@/views/tags/TagsView'
import NotesView from '@/views/notes/NotesView'
import TemplatesView from '@/views/templates/TemplatesView'
import AiEvalView from '@/views/ai-eval/AiEvalView'
import AiTimelineView from '@/views/ai-timeline/AiTimelineView'
import AiToolsView from '@/views/ai-tools/AiToolsView'
import AnalyticsView from '@/views/analytics/AnalyticsView'
import OrgView from '@/views/org/OrgView'
import WorkbenchHomeView from '@/views/workbench/WorkbenchHomeView'
import MyEventsView from '@/views/workbench/MyEventsView'
import MyTodosView from '@/views/workbench/MyTodosView'
import MyNotificationsView from '@/views/workbench/MyNotificationsView'
import OrgDirectoryView from '@/views/workbench/OrgDirectoryView'

// hash 模式：单容器 Nest 静态托管无 SPA fallback，hash 让部署链零改动（与 Vue 版一致）
export const router = createHashRouter([
  { path: '/login', element: <LoginView /> },
  { path: '/403', element: <ForbiddenView /> },
  {
    path: '/',
    element: (
      <AuthGate>
        <AdminLayout />
      </AuthGate>
    ),
    children: [
      { index: true, element: <DashboardView /> },
      { path: 'users', element: <UsersView /> },
      { path: 'users/:id', element: <UserDetailView /> },
      { path: 'events', element: <EventsView /> },
      { path: 'knowledge', element: <KnowledgeView /> },
      { path: 'notifications', element: <NotificationsView /> },
      { path: 'monitor', element: <MonitorView /> },
      { path: 'audit', element: <AiAuditView /> },
      { path: 'op-audit', element: <OpAuditView /> },
      { path: 'sessions', element: <SessionsView /> },
      { path: 'observability', element: <ObservabilityView /> },
      { path: 'system', element: <SystemView /> },
      { path: 'trash', element: <TrashView /> },
      { path: 'data-import', element: <DataImportView /> },
      { path: 'tags', element: <TagsView /> },
      { path: 'notes', element: <NotesView /> },
      { path: 'templates', element: <TemplatesView /> },
      { path: 'ai-eval', element: <AiEvalView /> },
      { path: 'ai-timeline', element: <AiTimelineView /> },
      { path: 'ai-tools', element: <AiToolsView /> },
      { path: 'analytics', element: <AnalyticsView /> },
      { path: 'org', element: <OrgView /> },
      // 工作台（应用侧）：普通企业用户
      {
        path: 'workbench',
        element: <Outlet />,
        children: [
          { index: true, element: <WorkbenchHomeView /> },
          { path: 'events', element: <MyEventsView /> },
          { path: 'todos', element: <MyTodosView /> },
          { path: 'notifications', element: <MyNotificationsView /> },
          { path: 'org', element: <OrgDirectoryView /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
