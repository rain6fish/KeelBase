import { create } from 'zustand'
import { authService } from '../services/auth-service'
import { setOnAuthFailure } from '../utils/api-client'
import type { AuthUser } from '../types/audit'

type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  errorMessage: string | null

  tryAutoLogin: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => {
  setOnAuthFailure(() => {
    set({ user: null, status: 'unauthenticated', errorMessage: null })
  })

  return {
    status: 'initial',
    user: null,
    errorMessage: null,

    tryAutoLogin: async () => {
      set({ status: 'loading' })
      const hasToken = await authService.isAuthenticated()
      if (!hasToken) {
        set({ status: 'unauthenticated' })
        return
      }
      try {
        const profile = await authService.getProfile()
        if (profile.role !== 'admin') {
          await authService.logout()
          set({ status: 'forbidden', user: null })
          return
        }
        set({ user: profile, status: 'authenticated' })
      } catch {
        await authService.logout()
        set({ status: 'unauthenticated' })
      }
    },

    login: async (username, password) => {
      set({ status: 'loading', errorMessage: null })
      try {
        const user = await authService.login(username.trim(), password)
        if (user.role !== 'admin') {
          await authService.logout()
          set({ status: 'forbidden', user: null, errorMessage: '该账号无管理员权限' })
          return false
        }
        set({ user, status: 'authenticated' })
        return true
      } catch (err: any) {
        set({
          status: 'unauthenticated',
          errorMessage: err?.message || '登录失败',
        })
        return false
      }
    },

    logout: async () => {
      await authService.logout()
      set({ user: null, status: 'unauthenticated', errorMessage: null })
    },

    clearError: () => set({ errorMessage: null }),
  }
})
