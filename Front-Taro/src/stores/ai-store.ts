import { create } from 'zustand'
import { aiService, type AiChatMessage } from '../services/ai-service'

interface AiState {
  messages: AiChatMessage[]
  conversationId: string | null
  isLoading: boolean
  error: string | null

  send: (message: string) => Promise<void>
  clear: () => void
}

/** AI 对话状态（MINI-1）：消息列表 + 会话 id + 非流式发送。 */
export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  conversationId: null,
  isLoading: false,
  error: null,

  send: async (message: string) => {
    const text = message.trim()
    if (!text || get().isLoading) return
    const history = get().messages
    set({
      messages: [...history, { role: 'user', content: text }],
      isLoading: true,
      error: null,
    })
    try {
      const result = await aiService.chat(text, get().conversationId ?? undefined)
      set({
        messages: [...get().messages, { role: 'assistant', content: result.reply }],
        conversationId: result.conversationId,
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err.message || 'AI 回复失败', isLoading: false })
    }
  },

  clear: () => set({ messages: [], conversationId: null, error: null }),
}))
