import { api } from './api-client'

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

export interface AiConversationSummary {
  id: string
  previewTitle: string
  createdAt?: string
}

/** AI 对话服务（MINI-1）：复用 /ai/chat 非流式，工具/记忆/审计后端已含。 */
export const aiService = {
  async chat(message: string, conversationId?: string): Promise<AiChatResult> {
    const res = await api.post<AiChatResult>('/ai/chat', {
      message,
      ...(conversationId ? { conversationId } : {}),
    })
    return res.data!
  },

  async listConversations(): Promise<AiConversationSummary[]> {
    const res = await api.get<AiConversationSummary[]>('/ai/conversations')
    return res.data ?? []
  },

  async deleteConversation(id: string): Promise<void> {
    await api.delete(`/ai/conversations/${id}`)
  },
}
