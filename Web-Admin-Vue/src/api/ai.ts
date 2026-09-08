// SPDX-License-Identifier: Apache-2.0

import { api } from './client'

/** 普通用户 AI 对话（本人数据作用域，非流式） */
export interface UserAiChatRequest {
  message: string
  conversationId?: string
}

export interface UserAiChatResponse {
  conversationId: string
  reply: string
  navigateTo?: string
  toolCalls?: string[]
}

/** Trust 沙盘：场景运行结果（POST /ai/trust-sandbox/run/:id） */
export interface TrustSandboxRunResult {
  scenario: string
  outcome: 'passed' | 'check' | 'guide' | 'unknown'
  detail?: string
  conversationId?: string
  resultType?: string
  resultId?: number
  effectId?: number
  requiresConfirmation?: boolean
  /** 仅当 resultType/resultId 对应真实 AI 工具副作用时 true，决定是否显示「业务动作治理详情」 */
  governed?: boolean
  error?: string
}

export interface TrustSandboxScenario {
  id: string
  title: string
  outcome: string
}

/** P0-2 旅程一键连跑的一步（Ask → 人工确认 → 越权拒绝 → 高风险阻断） */
export interface TrustSandboxJourneyStep {
  step: 'ask' | 'act' | 'break_deny' | 'break_block'
  scenario: string
  outcome: TrustSandboxRunResult['outcome']
  detail?: string
  conversationId?: string
  resultType?: string
  resultId?: number
  requiresConfirmation?: boolean
  governed?: boolean
}

export interface TrustSandboxJourneyResult {
  journey: 'trust'
  steps: TrustSandboxJourneyStep[]
}

/** P2 ④ 沙盘数据自清理结果 */
export interface TrustSandboxCleanupResult {
  removedCustomers: string[]
  skippedCustomers: string[]
  removedBobUsers: number
}

/** P2 ③ 跨访客旅程完成统计 */
export interface JourneyStats {
  today: number
  total: number
  todayDate: string
}

export const aiApi = {
  chat(data: UserAiChatRequest): Promise<UserAiChatResponse> {
    return api.post<UserAiChatResponse>('/ai/chat', data)
  },
  trustSandboxScenarios(): Promise<TrustSandboxScenario[]> {
    return api.get<TrustSandboxScenario[]>('/ai/trust-sandbox/scenarios')
  },
  trustSandboxRun(scenarioId: string): Promise<TrustSandboxRunResult> {
    return api.post<TrustSandboxRunResult>(`/ai/trust-sandbox/run/${scenarioId}`)
  },
  trustSandboxJourney(): Promise<TrustSandboxJourneyResult> {
    return api.post<TrustSandboxJourneyResult>('/ai/trust-sandbox/journey')
  },
  trustSandboxCleanup(): Promise<TrustSandboxCleanupResult> {
    return api.post<TrustSandboxCleanupResult>('/ai/trust-sandbox/cleanup')
  },
  trustSandboxJourneyComplete(): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/ai/trust-sandbox/journey/complete')
  },
  trustSandboxJourneyStats(): Promise<JourneyStats> {
    return api.get<JourneyStats>('/ai/trust-sandbox/journey/stats')
  },
}
