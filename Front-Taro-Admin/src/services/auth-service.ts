import { api } from '../utils/api-client'
import { storage } from '../utils/storage'
import type { AuthUser } from '../types/audit'

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export const authService = {
  async login(username: string, password: string): Promise<AuthUser> {
    const res = await api.post<LoginResponse>('/auth/login', { username, password })
    const data = res.data!
    await storage.saveTokens(data.accessToken, data.refreshToken)
    return data.user
  },

  async getProfile(): Promise<AuthUser> {
    const res = await api.get<AuthUser>('/auth/me')
    return res.data!
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } catch {
      // Best-effort
    }
    await storage.clearTokens()
  },

  async isAuthenticated(): Promise<boolean> {
    const tokens = await storage.readTokens()
    return tokens.accessToken !== null
  },
}
