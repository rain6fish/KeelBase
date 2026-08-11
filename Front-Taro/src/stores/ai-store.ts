import { create } from 'zustand'
import { aiService, type AiChatMessage, type AiConversationSummary } from '../services/ai-service'

interface AiState {
  messages: AiChatMessage[]
  conversationId: string | null
  isLoading: boolean
  error: string | null

  // 历史列表
  history: AiConversationSummary[]
  historyLoading: boolean
  historyError: string | null

  send: (message: string) => Promise<void>
  clear: () => void
  loadHistory: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
}

/** AI 对话状态（MINI-1 + DX-3）：消息 + 会话 + 历史列表/加载/删除。 */
export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  conversationId: null,
  isLoading: false,
  error: null,

  history: [],
  historyLoading: false,
  historyError: null,

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

  loadHistory: async () => {
    set({ historyLoading: true, historyError: null })
    try {
      const history = await aiService.listConversations()
      set({ history, historyLoading: false })
    } catch (err: any) {
      set({ historyError: err.message || '加载历史失败', historyLoading: false })
    }
  },

  openConversation: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const conv = await aiService.getConversation(id)
      set({
        messages: conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        conversationId: id,
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err.message || '加载对话失败', isLoading: false })
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await aiService.deleteConversation(id)
      set({ history: get().history.filter((c) => c.id !== id) })
      // 若删除的是当前会话，清空内存
      if (get().conversationId === id) {
        set({ messages: [], conversationId: null })
      }
    } catch (err: any) {
      throw new Error(err.message || '删除失败')
    }
  },
}))
