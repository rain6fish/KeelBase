// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { authApi } from '@/api/auth'
import { storage } from '@/utils/storage'
import type { AuthUser } from '@/types/api'

export type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  errorMessage: string
  tryAutoLogin: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initial',
  user: null,
  errorMessage: '',

  async tryAutoLogin() {
    const { accessToken } = storage.readTokens()
    if (!accessToken) {
      set({ status: 'unauthenticated' })
      return
    }
    set({ status: 'loading' })
    try {
      const user = await authApi.me()
      set({ status: 'authenticated', user })
    } catch {
      storage.clearTokens()
      set({ status: 'unauthenticated', user: null })
    }
  },

  async login(username: string, password: string): Promise<boolean> {
    set({ status: 'loading', errorMessage: '' })
    try {
      const result = await authApi.login(username, password)
      storage.saveTokens(result.accessToken, result.refreshToken)
      set({ status: 'authenticated', user: result.user })
      return true
    } catch (err) {
      set({ status: 'unauthenticated', errorMessage: err instanceof Error ? err.message : '登录失败' })
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
    set({ user: null, status: 'unauthenticated' })
  },
}))

/** 反应式角色判断（等价 Vue getter isAdmin） */
export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'admin')
}
