import Taro from '@tarojs/taro'
import { api, ApiError } from '../utils/api-client'
import { API_BASE_URL } from '../utils/constants'
import type { PaginatedList } from '../types/api'
import type { AdminUser, UserRole } from '../types/user'
import type { AdminEvent } from '../types/event'
import type { AuditLog, UsageStats } from '../types/audit'
import type {
  MonitorSummary,
  PlatformOverview,
  AdminSession,
  BroadcastResult,
  OperationAuditLog,
  KnowledgeArticle,
  AppVersionInfo,
  UserDetail,
} from '../types/admin'

export const adminService = {
  getUsers(page = 1, limit = 20, keyword?: string): Promise<PaginatedList<AdminUser>> {
    return api
      .get<PaginatedList<AdminUser>>('/users', {
        page,
        limit,
        ...(keyword ? { keyword } : {}),
      })
      .then((res) => res.data!)
  },

  updateUserRole(id: number, role: UserRole): Promise<AdminUser> {
    return api
      .patch<AdminUser>(`/users/${id}/role`, { role })
      .then((res) => res.data!)
  },

  deleteUser(id: number): Promise<void> {
    return api.delete(`/users/${id}`).then(() => {})
  },

  getAllEvents(
    page = 1,
    limit = 20,
    filter?: { keyword?: string; userId?: number; isCancelled?: boolean; start?: string; end?: string },
  ): Promise<PaginatedList<AdminEvent>> {
    return api
      .get<PaginatedList<AdminEvent>>('/events/admin/all', {
        page,
        limit,
        ...(filter?.keyword ? { keyword: filter.keyword } : {}),
        ...(filter?.userId != null ? { userId: filter.userId } : {}),
        ...(filter?.isCancelled != null ? { isCancelled: filter.isCancelled } : {}),
        ...(filter?.start ? { start: filter.start } : {}),
        ...(filter?.end ? { end: filter.end } : {}),
      })
      .then((res) => res.data!)
  },

  deleteEvent(id: number): Promise<void> {
    return api.delete(`/events/admin/${id}`).then(() => {})
  },

  getAuditLogs(params: { userId?: string; limit?: number; offset?: number; since?: string } = {}): Promise<AuditLog[]> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset
    if (params.since) query.since = params.since
    return api.get<AuditLog[]>('/audit/logs', query).then((res) => res.data!)
  },

  getAuditStats(since?: string): Promise<UsageStats> {
    return api
      .get<UsageStats>('/audit/stats', { ...(since ? { since } : {}) })
      .then((res) => res.data!)
  },

  getOperationAuditLogs(page = 1, limit = 20, userId?: string, since?: string): Promise<PaginatedList<OperationAuditLog>> {
    return api
      .get<PaginatedList<OperationAuditLog>>('/audit/operations/logs', {
        page,
        limit,
        ...(userId ? { userId } : {}),
        ...(since ? { since } : {}),
      })
      .then((res) => res.data!)
  },

  getMonitorSummary(): Promise<MonitorSummary> {
    return api.get<MonitorSummary>('/admin/monitor/summary').then((res) => res.data!)
  },

  getOverview(days = 7): Promise<PlatformOverview> {
    return api.get<PlatformOverview>('/admin/overview', { days }).then((res) => res.data!)
  },

  getSessions(): Promise<AdminSession[]> {
    return api.get<AdminSession[]>('/admin/sessions').then((res) => res.data!)
  },

  revokeSession(id: number): Promise<void> {
    return api.delete(`/admin/sessions/${id}`).then(() => {})
  },

  broadcastNotification(data: { title: string; body?: string; type?: string; userIds?: number[] }): Promise<BroadcastResult> {
    return api
      .post<BroadcastResult>('/admin/notifications/broadcast', data)
      .then((res) => res.data!)
  },

  getKnowledge(page = 1, limit = 20, q?: string): Promise<PaginatedList<KnowledgeArticle>> {
    return api
      .get<PaginatedList<KnowledgeArticle>>('/ai/knowledge', { page, limit, ...(q ? { q } : {}) })
      .then((res) => res.data!)
  },

  createKnowledge(data: { title: string; content: string; category?: string }): Promise<KnowledgeArticle> {
    return api.post<KnowledgeArticle>('/ai/knowledge', data).then((res) => res.data!)
  },

  updateKnowledge(id: number, data: { title?: string; content?: string; category?: string }): Promise<KnowledgeArticle> {
    return api.patch<KnowledgeArticle>(`/ai/knowledge/${id}`, data).then((res) => res.data!)
  },

  deleteKnowledge(id: number): Promise<void> {
    return api.delete(`/ai/knowledge/${id}`).then(() => {})
  },

  createUser(data: { username: string; email: string; password: string; nickname: string; firstName?: string; lastName?: string }): Promise<AdminUser> {
    return api.post<AdminUser>('/users', data).then((res) => res.data!)
  },

  getAppVersion(): Promise<AppVersionInfo> {
    return api.get<AppVersionInfo>('/app/version').then((res) => res.data!)
  },

  getUserDetail(id: number): Promise<UserDetail> {
    return api.get<UserDetail>(`/admin/users/${id}/detail`).then((res) => res.data!)
  },

  async uploadKnowledge(
    filePath: string,
    fileName: string,
    formData?: { title?: string; category?: string },
  ): Promise<KnowledgeArticle> {
    const { storage } = await import('../utils/storage')
    const tokens = await storage.readTokens()
    const res = await Taro.uploadFile({
      url: `${API_BASE_URL}/ai/knowledge/upload`,
      filePath,
      name: 'file',
      header: tokens.accessToken
        ? { Authorization: `Bearer ${tokens.accessToken}` }
        : {},
      formData,
    })
    const body = JSON.parse(res.data as string) as {
      code: number
      message: string
      data?: KnowledgeArticle
    }
    if (res.statusCode >= 400) {
      throw new ApiError(body?.message || `Upload failed (${res.statusCode})`, res.statusCode)
    }
    return body.data!
  },
}
