import Taro from '@tarojs/taro'
import { API_BASE_URL, API_TIMEOUT } from './constants'
import { storage } from './storage'
import type { ApiResponse } from '../types/api'

const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/refresh']

let onAuthFailure: (() => void) | null = null

export function setOnAuthFailure(callback: () => void) {
  onAuthFailure = callback
}

function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((ep) => path.includes(ep))
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const tokens = await storage.readTokens()
    if (!tokens.refreshToken) return false

    const response = await Taro.request({
      url: `${API_BASE_URL}/auth/refresh`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { refreshToken: tokens.refreshToken },
    })

    const body = response.data as any
    const data = body?.data
    if (data?.accessToken && data?.refreshToken) {
      await storage.saveTokens(data.accessToken, data.refreshToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

export class ApiError extends Error {
  statusCode: number
  errors?: Record<string, string[]>

  constructor(message: string, statusCode: number, errors?: Record<string, string[]>) {
    super(message)
    this.statusCode = statusCode
    this.errors = errors
  }
}

async function request<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: any,
): Promise<ApiResponse<T>> {
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  if (!isPublicEndpoint(path)) {
    const tokens = await storage.readTokens()
    if (tokens.accessToken) {
      header['Authorization'] = `Bearer ${tokens.accessToken}`
    }
  }

  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}${path}`,
      method,
      header,
      data,
      timeout: API_TIMEOUT,
      dataType: 'json',
    })

    const body = response.data as ApiResponse<T>

    // Handle 401 - try token refresh once
    if (response.statusCode === 401 && !isPublicEndpoint(path)) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        const tokens = await storage.readTokens()
        header['Authorization'] = `Bearer ${tokens.accessToken}`
        const retry = await Taro.request({
          url: `${API_BASE_URL}${path}`,
          method,
          header,
          data,
          timeout: API_TIMEOUT,
          dataType: 'json',
        })
        const retryBody = retry.data as ApiResponse<T>
        if (retry.statusCode >= 400) {
          if (retry.statusCode === 401) {
            await storage.clearTokens()
            onAuthFailure?.()
          }
          throw new ApiError(
            (retryBody as any)?.message || `Request failed with status ${retry.statusCode}`,
            retry.statusCode,
            (retryBody as any)?.errors,
          )
        }
        return retryBody
      }
      await storage.clearTokens()
      onAuthFailure?.()
    }

    // 非 2xx 统一抛错，让上层展示后端 message（否则 data 为 null 会导致空指针崩溃）
    if (response.statusCode >= 400) {
      throw new ApiError(
        (body as any)?.message || `Request failed with status ${response.statusCode}`,
        response.statusCode,
        (body as any)?.errors,
      )
    }

    return body
  } catch (err: any) {
    if (err instanceof ApiError) throw err
    throw new ApiError(err?.message || 'Network error', 0)
  }
}

export const api = {
  get<T = any>(path: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    return request<T>('GET', path, params)
  },

  post<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
    return request<T>('POST', path, data)
  },

  patch<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
    return request<T>('PATCH', path, data)
  },

  delete<T = any>(path: string): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path)
  },
}
