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
 * 与后端 `Server-NestJS/src/common/dto/paginated.ts` 的 `Paginated<T>` **同形**——那边是唯一定义
 * （`paginated()` 组装），这边是它的镜像。五个字段都必填。
 *
 * 背景：分页响应此前**没有真源**，后端长出了三种形状（`{items,total}` · 再加 `page,limit` · 再加
 * `totalPages`），而这里的类型只对得上其中一种。2026-09-22 已把后端 12 处返回点收敛到含 `totalPages`
 * 的超集形状（纯加性），本类型随之收紧为如实描述。
 *
 * ⚠ 不适用于「封顶列表」端点（如 crm/pm 的 `listTasks`：无 `page`/`limit`，内部硬编码 `take: N`，
 * 其 `total` 是全量计数而 `items` 是截断后的）。那些端点不返回此形状，也别标成这个类型。
 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
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
