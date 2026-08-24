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

export const aiApi = {
  chat(data: UserAiChatRequest): Promise<UserAiChatResponse> {
    return api.post<UserAiChatResponse>('/ai/chat', data)
  },
}
