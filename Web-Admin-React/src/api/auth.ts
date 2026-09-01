// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { AuthUser, LoginResult } from '@/types/api'

export const authApi = {
  login(username: string, password: string): Promise<LoginResult> {
    return api.post<LoginResult>('/auth/login', { username, password })
  },
  me(): Promise<AuthUser> {
    return api.get<AuthUser>('/auth/me')
  },
  logout(): Promise<null> {
    return api.post<null>('/auth/logout')
  },
}
