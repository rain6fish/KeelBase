import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { storage } from '@/utils/storage'
import type { AuthUser } from '@/types/api'

export type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    status: 'initial' as AuthStatus,
    user: null as AuthUser | null,
    errorMessage: '',
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async tryAutoLogin() {
      const { accessToken } = storage.readTokens()
      if (!accessToken) {
        this.status = 'unauthenticated'
        return
      }
      this.status = 'loading'
      try {
        this.user = await authApi.me()
        this.status = 'authenticated'
      } catch {
        storage.clearTokens()
        this.status = 'unauthenticated'
        this.user = null
      }
    },
    async login(username: string, password: string): Promise<boolean> {
      this.status = 'loading'
      this.errorMessage = ''
      try {
        const result = await authApi.login(username, password)
        storage.saveTokens(result.accessToken, result.refreshToken)
        this.user = result.user
        this.status = 'authenticated'
        return true
      } catch (err) {
        this.status = 'unauthenticated'
        this.errorMessage = err instanceof Error ? err.message : '登录失败'
        return false
      }
    },
    async logout() {
      try {
        await authApi.logout()
      } catch {
        // best-effort：登出失败也继续清本地
      }
      storage.clearTokens()
      this.user = null
      this.status = 'unauthenticated'
    },
  },
})
