import { api } from './client'
import type { AuthUser, LoginResult } from '@/types/api'

/** B1：管理员为目标用户反查权限决策依据（POST /auth/permissions/explain/target） */
export interface ExplainTargetResult {
  userId: number
  username: string
  action: string
  subject: string
  allowed: boolean
  reason: string
  deniedBy: 'casl' | null
}

export const authApi = {
  login(username: string, password: string): Promise<LoginResult> {
    return api.post<LoginResult>('/auth/login', { username, password })
  },
  /** 登录页访问统计：记录 IP/OS/浏览器/时间（服务端写文件，失败静默不影响登录） */
  loginStats(): Promise<{ ok: boolean }> {
    return api.post('/auth/login-stats', { userAgent: navigator.userAgent })
  },
  me(): Promise<AuthUser> {
    return api.get<AuthUser>('/auth/me')
  },
  logout(): Promise<null> {
    return api.post<null>('/auth/logout')
  },
  explainTarget(userId: number, action: string, subject: string): Promise<ExplainTargetResult> {
    return api.post<ExplainTargetResult>('/auth/permissions/explain/target', { userId, action, subject })
  },
  oauthProviders(): Promise<{ enabledProviders: string[]; providers: unknown[]; groups: Record<string, unknown[]> }> {
    return api.get('/auth/oauth/providers')
  },
  oidcUrl(redirectUri: string): Promise<{ url: string }> {
    return api.get('/auth/oauth/oidc/url', { redirectUri })
  },
  oidcLogin(code: string, redirectUri: string): Promise<LoginResult> {
    return api.post<LoginResult>('/auth/oauth', { provider: 'oidc', authorizationCode: code, redirectUri })
  },
}
