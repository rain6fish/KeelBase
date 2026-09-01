// SPDX-License-Identifier: Apache-2.0

/** 后端统一响应包装 {code, message, data, timestamp} */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
}

/** 分页响应 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

/** 登录/me 返回的当前用户 */
export interface AuthUser {
  id: number
  username: string
  email: string
  nickname?: string
  role: 'user' | 'admin'
  firstName?: string
  lastName?: string
  phone?: string
  bio?: string
  avatarUrl?: string
  emailVerified?: boolean
  createdAt?: string
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}
