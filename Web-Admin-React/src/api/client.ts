// SPDX-License-Identifier: Apache-2.0

import axios, { type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL, API_TIMEOUT } from '@/utils/constants'
import { storage } from '@/utils/storage'
import type { ApiResponse, TokenPair } from '@/types/api'

const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/refresh']

let onAuthFailure: (() => void) | null = null

/** 注入「刷新失败登出」回调（router guards / auth store 设置） */
export function setOnAuthFailure(callback: () => void) {
  onAuthFailure = callback
}

function isPublicEndpoint(path: string): boolean {
  // 精确路径段匹配：避免 /auth/login 子串误配 /auth/login-phone 等
  return PUBLIC_ENDPOINTS.includes(path.split('?')[0])
}

export class ApiError extends Error {
  statusCode: number
  errorCode?: string
  errors?: Record<string, string[]>

  constructor(message: string, statusCode: number, errorCode?: string, errors?: Record<string, string[]>) {
    super(message)
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.errors = errors
  }
}

/** 后端业务错误码判断：写操作邮箱未验证 403 */
export function isEmailNotVerified(err: unknown): boolean {
  return err instanceof ApiError && err.errorCode === 'EMAIL_NOT_VERIFIED'
}

// 共享刷新 Promise：并发 401 时只发一次刷新请求（防 stampede）
let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const { refreshToken } = storage.readTokens()
      if (!refreshToken) return false
      const res = await axios.post<ApiResponse<TokenPair>>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: API_TIMEOUT },
      )
      const data = res.data?.data
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

const instance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
})

instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!isPublicEndpoint(config.url ?? '')) {
    const { accessToken } = storage.readTokens()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    // 统一解包 { code, message, data, timestamp }；HTTP 2xx + code 0 → data
    const body = response.data as ApiResponse
    if (body && typeof body === 'object' && 'data' in body) {
      return body.data as never
    }
    return body as never
  },
  async (error) => {
    const config = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status as number | undefined
    const path = config?.url ?? ''

    // 401 且非公开端点 → 刷新一次重试
    if (status === 401 && config && !config._retry && !isPublicEndpoint(path)) {
      config._retry = true
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        const { accessToken } = storage.readTokens()
        config.headers = { ...(config.headers ?? {}), Authorization: `Bearer ${accessToken}` }
        try {
          return await instance(config)
        } catch (retryErr) {
          // 重试仍失败（可能是刷新后新 401）
          if ((retryErr as { response?: { status?: number } })?.response?.status === 401) {
            storage.clearTokens()
            onAuthFailure?.()
          }
          throw normalizeError(retryErr)
        }
      }
      storage.clearTokens()
      onAuthFailure?.()
    }

    return Promise.reject(normalizeError(error))
  },
)

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const axiosErr = error as {
    response?: { status?: number; data?: { message?: string; errorCode?: string; errors?: Record<string, string[]> } }
    message?: string
  }
  const status = axiosErr.response?.status ?? 0
  const message =
    axiosErr.response?.data?.message || (status === 0 ? 'Network error' : `Request failed with status ${status}`)
  return new ApiError(message, status, axiosErr.response?.data?.errorCode, axiosErr.response?.data?.errors)
}

/** 与旧 api 封装对齐的调用面：get/post/patch/delete */
export const api = {
  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return instance.get(path, { params }) as Promise<T>
  },
  post<T = unknown>(path: string, data?: unknown): Promise<T> {
    return instance.post(path, data) as Promise<T>
  },
  put<T = unknown>(path: string, data?: unknown): Promise<T> {
    return instance.put(path, data) as Promise<T>
  },
  patch<T = unknown>(path: string, data?: unknown): Promise<T> {
    return instance.patch(path, data) as Promise<T>
  },
  delete<T = unknown>(path: string): Promise<T> {
    return instance.delete(path) as Promise<T>
  },
}

export default instance
