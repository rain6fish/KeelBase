import { api } from './client'
import type {
  AdminAiChatRequest,
  AdminAiChatResponse,
  AdminSession,
  AiConversationMessage,
  AiConversationSummary,
  AnalyticsResponse,
  AppVersionInfo,
  BroadcastResult,
  MonitorSummary,
  OpsSummary,
  PlatformOverview,
  TrashResponse,
  TrashRestoreResult,
} from '@/types/admin'

/** 校验对话 id，防止路径穿越（与 Flutter AiConversationRepository 一致） */
function validateConversationId(id: string): string {
  if (!id || id.includes('/') || id.includes('?') || id.includes('#') || id.includes('..')) {
    throw new Error('Invalid conversation id')
  }
  return id
}

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
  // System AI Assistant（管理端 AI 助手）
  adminAiChat(data: AdminAiChatRequest): Promise<AdminAiChatResponse> {
    return api.post<AdminAiChatResponse>('/admin/ai/chat', data)
  },
  // 对话历史（admin 复用本人 /ai/conversations，与普通用户 AI 聊天一致）
  aiConversations(): Promise<AiConversationSummary[]> {
    return api.get<AiConversationSummary[]>('/ai/conversations')
  },
  aiConversation(id: string): Promise<AiConversationSummary & { messages: AiConversationMessage[] }> {
    return api.get<AiConversationSummary & { messages: AiConversationMessage[] }>(
      `/ai/conversations/${validateConversationId(id)}`,
    )
  },
  deleteAiConversation(id: string): Promise<null> {
    return api.delete<null>(`/ai/conversations/${validateConversationId(id)}`)
  },
}
