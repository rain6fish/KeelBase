// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { ConversationSummary, TraceResponse } from '@/types/workbench'

/** P0-14 Agent Decision Trace：本人 AI 对话执行轨迹（user-scoped） */
export const aiTraceApi = {
  conversations(): Promise<ConversationSummary[]> {
    return api.get<ConversationSummary[]>('/ai/conversations')
  },
  trace(id: string): Promise<TraceResponse> {
    return api.get<TraceResponse>(`/ai/conversations/${id}/trace`)
  },
  /** P0-15：撤销本人 AI 创建的记录（软删可恢复） */
  revokeEffect(effectId: number): Promise<{ revoked: boolean; effectId: number }> {
    return api.delete<{ revoked: boolean; effectId: number }>(`/ai/my/tool-effects/${effectId}`)
  },
}
