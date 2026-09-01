// SPDX-License-Identifier: Apache-2.0

import { api, governanceApi } from './client'
import type { AdminAiTool, AiAgent, AiApprovalRequest, GovernanceActionResponse, ToolEffectsResponse, BusinessHistoryResponse } from '@/types/admin'

/**
 * D2-5c：治理数据端点走独立治理台（governanceApi，VITE_GOVERNANCE_URL 配置时指向治理台；
 * 未配置回落主应用）。依赖业务数据/执行链的端点（工具清单、治理视图、approve 决策）留主应用——
 * D2-4 approve 回调完成后 decideApproval 再切治理台。
 */
export const aiToolsApi = {
  /** 工具清单（主应用：工具注册在业务运行时） */
  tools(): Promise<AdminAiTool[]> {
    return api.get<AdminAiTool[]>('/ai/tools')
  },
  /** 副作用列表（治理台） */
  effects(userId?: number, page = 1, limit = 20): Promise<ToolEffectsResponse> {
    return governanceApi.get<ToolEffectsResponse>('/ai/tool-effects', {
      ...(userId != null ? { userId } : {}),
      page,
      limit,
    })
  },
  /** 撤销副作用（治理台 → 回调业务系统软删） */
  revokeEffect(id: number): Promise<{ revoked: boolean; effectId: number }> {
    return governanceApi.delete<{ revoked: boolean; effectId: number }>(`/ai/tool-effects/${id}`)
  },
  /** D1/B4 治理视图：业务动作 → AI 副作用 + 决策轨迹（主应用：轨迹依赖业务对话表） */
  governanceAction(resultType: string, resultId: number): Promise<GovernanceActionResponse> {
    return api.get(`/ai/governance/action/${resultType}/${resultId}`)
  },
  /** §22.16 A-2 业务实体行为史：按实体聚合跨来源行为史 */
  entityHistory(resultType: string, resultId: number): Promise<BusinessHistoryResponse> {
    return api.get(`/ai/governance/entity/${resultType}/${resultId}`)
  },
  /** D5 Agent Registry：已注册 Agent 清单（治理台） */
  agents(): Promise<AiAgent[]> {
    return governanceApi.get('/ai/agents')
  },
  /** D2-1d 治理策略（治理台自有表，JSON 字符串接口保持调用方不变）。 */
  async policy(): Promise<string | undefined> {
    const p = await governanceApi.get<{ tools: Record<string, unknown>; audit: { granularity: string } }>('/ai/governance/policy')
    return JSON.stringify(p)
  },
  /** D2-1d 保存治理策略（治理台 PUT，实时生效）。 */
  savePolicy(value: string): Promise<unknown> {
    return governanceApi.put('/ai/governance/policy', JSON.parse(value))
  },
  /** §22.15 策略模板库：三档预设（金融/政务/通用，治理台） */
  policyPresets(): Promise<Array<{ id: string; labelKey: string; descriptionKey: string }>> {
    return governanceApi.get('/ai/governance/policy/presets')
  },
  /** §22.15 策略模板库：一键应用预设（治理台，实时生效） */
  applyPolicyPreset(presetId: string): Promise<unknown> {
    return governanceApi.post('/ai/governance/policy/apply-preset', { presetId })
  },
  /** R4 双人审批：待审批列表（治理台） */
  approvals(): Promise<AiApprovalRequest[]> {
    return governanceApi.get('/ai/confirmations/pending')
  },
  /** R4 双人审批：已审批历史（治理台） */
  decidedApprovals(): Promise<AiApprovalRequest[]> {
    return governanceApi.get('/ai/confirmations/decided')
  },
  /** R4 双人审批：approver 决策（主应用：approve → 以 operator 维度执行工具，D2-4 回调后切治理台） */
  decideApproval(token: string, decision: 'approve' | 'decline'): Promise<{ ok: boolean; success?: boolean; resultId?: unknown; message?: string }> {
    return api.post(`/ai/confirmations/${token}/approve-by`, { decision })
  },
}
