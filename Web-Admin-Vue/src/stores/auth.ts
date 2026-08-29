import { defineStore } from 'pinia'
import { authApi, type MyPermissions } from '@/api/auth'
import { storage } from '@/utils/storage'
import { PERMISSION_MAP } from '@/constants/permissions'
import type { AuthUser } from '@/types/api'

export type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    status: 'initial' as AuthStatus,
    user: null as AuthUser | null,
    errorMessage: '',
    permissions: null as MyPermissions | null,
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
    /** 渲染层权限点：admin（resources 含 all/all）全有；否则按 subject + scope 判定。 */
    hasPermission: (state) => (point: string) => {
      const resources = state.permissions?.resources
      if (!resources) return false
      if (resources.some((r) => r.subject === 'all' && r.scope === 'all')) return true
      const req = PERMISSION_MAP[point]
      if (!req) return false
      return resources.some((r) => r.subject === req.subject && r.scope === req.scope)
    },
  },
  actions: {
    /** 拉取当前用户能力清单（Explainable Authz）；失败置 null（不阻断，渲染层保守隐藏）。 */
    async loadPermissions() {
      if (this.permissions) return
      try {
        this.permissions = await authApi.myPermissions()
      } catch {
        this.permissions = null
      }
    },
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
    async oidcLogin(code: string, redirectUri: string): Promise<boolean> {
      this.status = 'loading'
      this.errorMessage = ''
      try {
        const result = await authApi.oidcLogin(code, redirectUri)
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
