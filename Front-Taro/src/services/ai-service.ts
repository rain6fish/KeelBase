// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import { translate } from '../i18n/translate'

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatResult {
  reply: string
  conversationId: string
  provider?: string
  model?: string
}

export interface AiHistoryMessage {
  role: string
  content: string
  timestamp?: string
}

export interface AiConversationSummary {
  id: string
  provider?: string
  model?: string
  summary?: string
  messages: AiHistoryMessage[]
  createdAt?: string
  lastActivityAt?: string

  /** 首条 user 消息内容（列表标题预览），无则用摘要/默认 */
  previewTitle: string
}

/** 新会话默认预览（内部哨兵，展示时经 translate 输出本地化文案）。 */
const DEFAULT_PREVIEW = '新对话'

/** 从后端返回行解析列表项：取首条 user 消息作预览标题。 */
function parseConversation(row: any): AiConversationSummary {
  const msgs: AiHistoryMessage[] = row.messages ?? []
  let preview = DEFAULT_PREVIEW
  for (const m of msgs) {
    if (m.role === 'user' && m.content) {
      preview = m.content.trim()
      break
    }
  }
  if (preview === DEFAULT_PREVIEW && row.summary) {
    preview = row.summary.slice(0, 30)
  }
  if (preview.length > 30) preview = `${preview.slice(0, 30)}…`
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    summary: row.summary,
    messages: msgs,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    previewTitle: preview === DEFAULT_PREVIEW ? translate('ai.newConversation') : preview,
  }
}

/** AI 对话服务（MINI-1 + DX-3）：复用 /ai/chat 非流式 + 历史列表/加载/删除。 */
export const aiService = {
  async chat(message: string, conversationId?: string): Promise<AiChatResult> {
    const res = await api.post<AiChatResult>('/ai/chat', {
      message,
      ...(conversationId ? { conversationId } : {}),
    })
    return res.data!
  },

  async listConversations(): Promise<AiConversationSummary[]> {
    const res = await api.get<any[]>('/ai/conversations')
    return (res.data ?? []).map(parseConversation)
  },

  async getConversation(id: string): Promise<AiConversationSummary> {
    const res = await api.get<any>(`/ai/conversations/${id}`)
    return parseConversation(res.data)
  },

  async deleteConversation(id: string): Promise<void> {
    await api.delete(`/ai/conversations/${id}`)
  },
}
