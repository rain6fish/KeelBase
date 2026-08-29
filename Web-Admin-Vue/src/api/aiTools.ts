import { api } from './client'
import type { AdminAiTool, AiAgent, AiApprovalRequest, GovernanceActionResponse, ToolEffectsResponse } from '@/types/admin'

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
  /** D5 Agent Registry：已注册 Agent 清单（管理台，企业可信可见呈现） */
  agents(): Promise<AiAgent[]> {
    return api.get('/ai/agents')
  },
  /** D2-1d 治理策略（自有表 ai_governance_policy，JSON 字符串接口保持调用方不变）。 */
  async policy(): Promise<string | undefined> {
    const p = await api.get<{ tools: Record<string, unknown>; audit: { granularity: string } }>('/ai/governance/policy')
    return JSON.stringify(p)
  },
  /** D2-1d 保存治理策略（PUT /ai/governance/policy 写自有表，实时生效）。 */
  savePolicy(value: string): Promise<unknown> {
    return api.put('/ai/governance/policy', JSON.parse(value))
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
