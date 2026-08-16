import { api } from './client'
import type {
  AdminSession,
  AnalyticsResponse,
  AppVersionInfo,
  BroadcastResult,
  MonitorSummary,
  OpsSummary,
  PlatformOverview,
  TrashResponse,
  TrashRestoreResult,
} from '@/types/admin'

export const adminApi = {
  monitorSummary(): Promise<MonitorSummary> {
    return api.get<MonitorSummary>('/admin/monitor/summary')
  },
  opsSummary(): Promise<OpsSummary> {
    return api.get<OpsSummary>('/admin/ops/summary')
  },
  overview(days = 7): Promise<PlatformOverview> {
    return api.get<PlatformOverview>('/admin/overview', { days })
  },
  sessions(): Promise<AdminSession[]> {
    return api.get<AdminSession[]>('/admin/sessions')
  },
  revokeSession(id: number): Promise<null> {
    return api.delete<null>(`/admin/sessions/${id}`)
  },
  broadcast(data: { title: string; body?: string; type?: string; userIds?: number[] }): Promise<BroadcastResult> {
    return api.post<BroadcastResult>('/admin/notifications/broadcast', data)
  },
  appVersion(): Promise<AppVersionInfo> {
    return api.get<AppVersionInfo>('/app/version')
  },
  // P3 新增
  trash(page = 1, limit = 20): Promise<TrashResponse> {
    return api.get<TrashResponse>('/admin/trash', { page, limit })
  },
  restoreTrash(type: 'event' | 'todo', id: number): Promise<TrashRestoreResult> {
    return api.post<TrashRestoreResult>(`/admin/trash/${type}/${id}/restore`)
  },
  analytics(days = 30): Promise<AnalyticsResponse> {
    return api.get<AnalyticsResponse>('/admin/analytics', { days })
  },
}
