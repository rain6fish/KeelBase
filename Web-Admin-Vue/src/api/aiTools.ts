import { api } from './client'
import type { AdminAiTool, SettingRow, ToolEffectsResponse } from '@/types/admin'

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
  /** HS-9 治理策略当前存储值（key = ai_governance_policy，JSON 字符串）。 */
  async policy(): Promise<string | undefined> {
    const rows = await api.get<SettingRow[]>('/settings')
    return rows.find((r) => r.key === 'ai_governance_policy')?.value
  },
  /** HS-9 保存治理策略（写 Settings 即实时生效，无需发版）。 */
  savePolicy(value: string): Promise<unknown> {
    return api.put('/settings/ai_governance_policy', { value, type: 'string' })
  },
}
