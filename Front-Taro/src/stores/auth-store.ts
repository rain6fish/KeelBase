// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import Taro from '@tarojs/taro'
import { authService } from '../services/auth-service'
import { setOnAuthFailure } from '../services/api-client'
import { translate } from '../i18n/translate'
import type { User, AuthStatus } from '../types/auth'

/** 认证状态（Taro→Vue3 迁移：zustand → pinia）：自动登录/登录/注册/登出 + 401 认证失败回调。 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    status: 'initial' as AuthStatus,
    user: null as User | null,
    errorMessage: null as string | null,
  }),
  actions: {
    async tryAutoLogin() {
      this.status = 'loading'
      const hasToken = await authService.isAuthenticated()
      if (!hasToken) {
        this.status = 'unauthenticated'
        return
      }
      try {
        const profile = await authService.getProfile()
        this.user = { id: profile.id, username: profile.username, nickname: profile.nickname }
        this.status = 'authenticated'
      } catch {
        await authService.logout()
        this.status = 'unauthenticated'
      }
    },

    async login(username: string, password: string) {
      this.status = 'loading'
      this.errorMessage = null
      try {
        const response = await authService.login(username, password)
        this.user = response.user
        this.status = 'authenticated'
        return true
      } catch (err: any) {
        this.status = 'error'
        this.errorMessage = err.message || translate('auth.loginFailed')
        return false
      }
    },

    async register(username: string, password: string, nickname: string) {
      this.status = 'loading'
      this.errorMessage = null
      try {
        const response = await authService.register(username, password, nickname)
        this.user = response.user
        this.status = 'authenticated'
        return true
      } catch (err: any) {
        this.status = 'error'
        this.errorMessage = err.message || translate('auth.registrationFailed')
        return false
      }
    },

    /** MINI-3：微信一键登录（仅小程序环境；Taro.login → code → /auth/oauth） */
    async wechatLogin() {
      if (process.env.TARO_ENV === 'h5') {
        this.errorMessage = translate('auth.wechatH5Unavailable')
        return false
      }
      this.status = 'loading'
      this.errorMessage = null
      try {
        const loginRes = await Taro.login()
        const code = loginRes.code
        if (!code) throw new Error(translate('auth.wechatLoginFailed'))
        const response = await authService.oauthLogin(code)
        this.user = response.user
        this.status = 'authenticated'
        return true
      } catch (err: any) {
        this.status = 'error'
        this.errorMessage = err.message || translate('auth.wechatLoginFailed')
        return false
      }
    },

    async logout() {
      await authService.logout()
      this.user = null
      this.status = 'unauthenticated'
      this.errorMessage = null
    },

    clearError() {
      this.errorMessage = null
    },
  },
})

// 注册 401 认证失败回调（与原 zustand create 的注册时机一致：模块加载即注册，运行期更新 store）
setOnAuthFailure(() => {
  const store = useAuthStore()
  store.$patch({ user: null, status: 'unauthenticated', errorMessage: null })
})
