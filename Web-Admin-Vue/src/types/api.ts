// SPDX-License-Identifier: Apache-2.0

/** 后端统一响应包装 {code, message, data, timestamp} */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
}

/**
 * 分页响应。
 *
 * ⚠ `page` / `limit` / `totalPages` 声明为**可选**，因为后端的分页响应**没有单源**——实测三种形状
 * 并存：`{items,total}`（crm / pm / knowledge / approval）· `{items,total,page,limit}`（users /
 * operation-audit / form-builder / tool-effects）· org 另带 `totalPages`。此前把 `page`/`limit` 写成
 * 必填，对多数端点就是**假的**。当前没有任何视图读它们（分页靠本地状态），所以标可选只是让类型不再说谎。
 *
 * 若要真正统一：先决定以哪种为准，再把分页形状登记进 wire 契约（`specs/protocol` 目前**没有**分页对象，
 * 这正是三种形状得以并存的原因），并同批改各端点及其消费方。
 */
export interface Paginated<T> {
  items: T[]
  total: number
  page?: number
  limit?: number
  totalPages?: number
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
