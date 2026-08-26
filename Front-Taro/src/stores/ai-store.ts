import { defineStore } from 'pinia'
import { aiService, type AiChatMessage, type AiConversationSummary } from '../services/ai-service'
import { translate } from '../i18n/translate'

/** AI 对话状态（MINI-1 + DX-3，Taro→Vue3 迁移：zustand → pinia）：消息 + 会话 + 历史列表/加载/删除。 */
export const useAiStore = defineStore('ai', {
  state: () => ({
    messages: [] as AiChatMessage[],
    conversationId: null as string | null,
    isLoading: false,
    error: null as string | null,

    // 历史列表
    history: [] as AiConversationSummary[],
    historyLoading: false,
    historyError: null as string | null,
  }),
  actions: {
    async send(message: string) {
      const text = message.trim()
      if (!text || this.isLoading) return
      const history = this.messages
      this.messages = [...history, { role: 'user', content: text }]
      this.isLoading = true
      this.error = null
      try {
        const result = await aiService.chat(text, this.conversationId ?? undefined)
        this.messages = [...this.messages, { role: 'assistant', content: result.reply }]
        this.conversationId = result.conversationId
        this.isLoading = false
      } catch (err: any) {
        this.error = err.message || translate('ai.replyFailed')
        this.isLoading = false
      }
    },

    clear() {
      this.messages = []
      this.conversationId = null
      this.error = null
    },

    async loadHistory() {
      this.historyLoading = true
      this.historyError = null
      try {
        this.history = await aiService.listConversations()
        this.historyLoading = false
      } catch (err: any) {
        this.historyError = err.message || translate('ai.historyLoadFailed')
        this.historyLoading = false
      }
    },

    async openConversation(id: string) {
      this.isLoading = true
      this.error = null
      try {
        const conv = await aiService.getConversation(id)
        this.messages = conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        this.conversationId = id
        this.isLoading = false
      } catch (err: any) {
        this.error = err.message || translate('ai.conversationLoadFailed')
        this.isLoading = false
      }
    },

    async deleteConversation(id: string) {
      try {
        await aiService.deleteConversation(id)
        this.history = this.history.filter((c) => c.id !== id)
        // 若删除的是当前会话，清空内存
        if (this.conversationId === id) {
          this.messages = []
          this.conversationId = null
        }
      } catch (err: any) {
        throw new Error(err.message || translate('ai.deleteFailed'))
      }
    },
  },
})
