// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AdminUser, UserRole } from '@/types/user'
import type { UserDetail } from '@/types/admin'

export const usersApi = {
  list(page = 1, limit = 20, keyword?: string): Promise<Paginated<AdminUser>> {
    return api.get<Paginated<AdminUser>>('/users', {
      page,
      limit,
      ...(keyword ? { keyword } : {}),
    })
  },
  create(data: {
    username: string
    email: string
    password: string
    nickname: string
    firstName?: string
    lastName?: string
  }): Promise<AdminUser> {
    return api.post<AdminUser>('/users', data)
  },
  updateRole(id: number, role: UserRole): Promise<AdminUser> {
    return api.patch<AdminUser>(`/users/${id}/role`, { role })
  },
  remove(id: number): Promise<null> {
    return api.delete<null>(`/users/${id}`)
  },
  detail(id: number): Promise<UserDetail> {
    return api.get<UserDetail>(`/admin/users/${id}/detail`)
  },
}
