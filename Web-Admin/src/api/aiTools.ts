import { api } from './client'
import type { AdminAiTool, ToolEffectsResponse } from '@/types/admin'

export const aiToolsApi = {
  tools(): Promise<AdminAiTool[]> {
    return api.get<AdminAiTool[]>('/ai/tools')
  },
  effects(userId?: number, page = 1, limit = 20): Promise<ToolEffectsResponse> {
    return api.get<ToolEffectsResponse>('/ai/tool-effects', {
      ...(userId != null ? { userId } : {}),
      page,
      limit,
    })
  },
  revokeEffect(id: number): Promise<{ revoked: boolean; effectId: number }> {
    return api.delete<{ revoked: boolean; effectId: number }>(`/ai/tool-effects/${id}`)
  },
}
