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
  error?: string
}

export interface TrustSandboxScenario {
  id: string
  title: string
  outcome: string
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
}
