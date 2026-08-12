import { api } from './client'
import type {
  AdminSession,
  AppVersionInfo,
  BroadcastResult,
  MonitorSummary,
  PlatformOverview,
} from '@/types/admin'

export const adminApi = {
  monitorSummary(): Promise<MonitorSummary> {
    return api.get<MonitorSummary>('/admin/monitor/summary')
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
}
