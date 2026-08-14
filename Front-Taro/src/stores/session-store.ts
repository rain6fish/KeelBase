import { defineStore } from 'pinia'
import { sessionService } from '../services/session-service'
import type { SessionItem } from '../types/session'

/** 登录会话状态（Taro→Vue3 迁移：zustand → pinia）：会话列表 + 远程登出。 */
export const useSessionStore = defineStore('session', {
  state: () => ({
    sessions: [] as SessionItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.sessions = await sessionService.getSessions()
        this.isLoading = false
      } catch (err: any) {
        this.error = err.message || 'Failed to load sessions'
        this.isLoading = false
      }
    },

    async revoke(id: number) {
      await sessionService.revokeSession(id)
      this.sessions = this.sessions.filter((s) => s.id !== id)
    },
  },
})
