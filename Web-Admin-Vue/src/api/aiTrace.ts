// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type { ConversationSummary, MyAiEffect, MyConfirmationItem, TraceResponse } from '@/types/workbench'
import type { BatchRevokeResult } from '@/types/workbench'

/** P0-14 Agent Decision Trace：本人 AI 对话执行轨迹（user-scoped） */
export const aiTraceApi = {
  conversations(): Promise<ConversationSummary[]> {
    return api.get<ConversationSummary[]>('/ai/conversations')
  },
  trace(id: string): Promise<TraceResponse> {
    return api.get<TraceResponse>(`/ai/conversations/${id}/trace`)
  },
  /** AI Action Center：本人 AI 写副作用清单（§internal.17 / docs/ai-action-center.spec.md） */
  myEffects(page = 1, limit = 20): Promise<Paginated<MyAiEffect>> {
    return api.get<Paginated<MyAiEffect>>('/ai/my/tool-effects', { page, limit })
  },
  /** P0-15：撤销本人 AI 创建的记录（软删可恢复） */
  revokeEffect(effectId: number): Promise<{ revoked: boolean; effectId: number }> {
    return api.delete<{ revoked: boolean; effectId: number }>(`/ai/my/tool-effects/${effectId}`)
  },
  /** G1：一键撤销本人在某会话的全部 AI 写副作用（会话级批量，返回逐条+汇总） */
  revokeConversationEffects(conversationId: string): Promise<BatchRevokeResult> {
    return api.delete<BatchRevokeResult>(`/ai/my/tool-effects?conversationId=${encodeURIComponent(conversationId)}`)
  },
  /** GA 待我确认中心：本人确认记录（docs/ai-action-center.spec.md §5.4） */
  myConfirmations(status?: MyConfirmationItem['status']): Promise<MyConfirmationItem[]> {
    return api.get<MyConfirmationItem[]>('/ai/my/confirmations', status ? { status } : undefined)
  },
  /** GA：对话之外裁决本人的确认（离线裁决，服务端条件更新把关幂等） */
  decideMyConfirmation(
    token: string,
    decision: 'approve' | 'decline',
  ): Promise<{ ok: boolean; success?: boolean; resultId?: unknown }> {
    return api.post<{ ok: boolean; success?: boolean; resultId?: unknown }>(
      `/ai/my/confirmations/${encodeURIComponent(token)}/decide`,
      { decision },
    )
  },
}
