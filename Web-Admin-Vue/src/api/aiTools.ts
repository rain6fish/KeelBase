import { api } from './client'
import type { AdminAiTool, AiApprovalRequest, GovernanceActionResponse, SettingRow, ToolEffectsResponse } from '@/types/admin'

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
  /** D1/B4 治理视图：业务动作 → AI 副作用 + 决策轨迹（Who/When/What/Why/Result/Side Effects/Integrity） */
  governanceAction(resultType: string, resultId: number): Promise<GovernanceActionResponse> {
    return api.get(`/ai/governance/action/${resultType}/${resultId}`)
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
  /** R4 双人审批：待审批列表（管理员） */
  approvals(): Promise<AiApprovalRequest[]> {
    return api.get('/ai/confirmations/pending')
  },
  /** R4 双人审批：已审批历史（管理员） */
  decidedApprovals(): Promise<AiApprovalRequest[]> {
    return api.get('/ai/confirmations/decided')
  },
  /** R4 双人审批：approver 决策（approve → 以 operator 维度执行工具） */
  decideApproval(token: string, decision: 'approve' | 'decline'): Promise<{ ok: boolean; success?: boolean; resultId?: unknown; message?: string }> {
    return api.post(`/ai/confirmations/${token}/approve-by`, { decision })
  },
}
