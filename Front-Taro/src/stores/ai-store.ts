// SPDX-License-Identifier: Apache-2.0

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
    // Bumped by clear/openConversation so late replies from a previous
    // conversation cannot write into the current one.
    //
    // clear/openConversation 递增；上一会话的迟到回复据此丢弃，不得写进当前会话。
    requestGeneration: 0,

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
      const generation = this.requestGeneration
      this.messages = [...history, { role: 'user', content: text }]
      this.isLoading = true
      this.error = null
      try {
        const result = await aiService.chat(text, this.conversationId ?? undefined)
        if (generation !== this.requestGeneration) return
        this.messages = [...this.messages, { role: 'assistant', content: result.reply }]
        this.conversationId = result.conversationId
      } catch (err: any) {
        if (generation !== this.requestGeneration) return
        this.error = err.message || translate('ai.replyFailed')
      } finally {
        if (generation === this.requestGeneration) this.isLoading = false
      }
    },

    clear() {
      this.requestGeneration++
      this.messages = []
      this.conversationId = null
      this.error = null
      this.isLoading = false
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
      // A newer selection wins: older loads and in-flight replies are dropped.
      //
      // 后选的会话胜出：更早的加载与在途回复一并作废。
      const generation = ++this.requestGeneration
      this.isLoading = true
      this.error = null
      try {
        const conv = await aiService.getConversation(id)
        if (generation !== this.requestGeneration) return
        this.messages = conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        this.conversationId = id
      } catch (err: any) {
        if (generation !== this.requestGeneration) return
        this.error = err.message || translate('ai.conversationLoadFailed')
      } finally {
        if (generation === this.requestGeneration) this.isLoading = false
      }
    },

    async deleteConversation(id: string) {
      try {
        await aiService.deleteConversation(id)
        this.history = this.history.filter((c) => c.id !== id)
        // 若删除的是当前会话，清空内存
        if (this.conversationId === id) {
          // Invalidate an in-flight reply so it cannot resurrect the deleted conversation.
          //
          // 作废在途回复，避免它把已删除的会话复活。
          this.requestGeneration++
          this.messages = []
          this.conversationId = null
          this.isLoading = false
        }
      } catch (err: any) {
        throw new Error(err.message || translate('ai.deleteFailed'))
      }
    },
  },
})
