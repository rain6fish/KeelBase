// SPDX-License-Identifier: Apache-2.0

/**
 * 会话 / token 刷新 adapter（唯一实现）—— 对齐 CE-1 wire Contract v1
 * （api-response 信封 + /auth/refresh 双 token 轮换）。
 *
 * FE-1：原先 client.ts（axios）与 utils/streamChat.ts（裸 fetch）各有一份刷新实现，
 * 语义靠人工对齐、易漂移；此处收敛为单点。切换 Runtime 只换本 adapter。
 */
import axios from 'axios'
import { API_BASE_URL, API_TIMEOUT } from '@/utils/constants'
import { storage } from '@/utils/storage'
import { unwrapEnvelope, type ApiEnvelope } from './envelope'
import type { TokenPair } from '@/types/api'

/** 共享刷新 Promise：并发 401 时只发一次刷新请求（防 stampede） */
let refreshPromise: Promise<boolean> | null = null

/**
 * 刷新 access token（HTTP 200 + 轮换后双 token）。
 * 用裸 axios（非统一 instance）以免触发 401 拦截器递归。
 */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const { refreshToken } = storage.readTokens()
      if (!refreshToken) return false
      const res = await axios.post<ApiEnvelope<TokenPair>>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: API_TIMEOUT },
      )
      const data = unwrapEnvelope<TokenPair>(res.data)
      if (data?.accessToken && data?.refreshToken) {
        storage.saveTokens(data.accessToken, data.refreshToken)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}
