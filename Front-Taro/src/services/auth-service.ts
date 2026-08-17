 import { api } from './api-client'
 import { storage } from '../utils/storage'
 import type { LoginResponse, UserProfile, LoginRequest, RegisterRequest } from '../types/auth'
 
 export const authService = {
   async login(username: string, password: string): Promise<LoginResponse> {
     const req: LoginRequest = { username, password }
     const res = await api.post<LoginResponse>('/auth/login', req)
     const data = res.data!
     await storage.saveTokens(data.accessToken, data.refreshToken)
     return data
   },
 
   async register(username: string, password: string, nickname: string): Promise<LoginResponse> {
     const req: RegisterRequest = { username, password, nickname }
     const res = await api.post<LoginResponse>('/auth/register', req)
     const data = res.data!
     await storage.saveTokens(data.accessToken, data.refreshToken)
     return data
   },

   /** MINI-3：微信小程序一键登录（Taro.login 的 code → 后端 /auth/oauth code2Session） */
   async oauthLogin(authorizationCode: string): Promise<LoginResponse> {
     const res = await api.post<LoginResponse>('/auth/oauth', {
       provider: 'wechat',
       providerType: 'miniapp',
       authorizationCode,
     })
     const data = res.data!
     await storage.saveTokens(data.accessToken, data.refreshToken)
     return data
   },
 
   async getProfile(): Promise<UserProfile> {
     const res = await api.get<UserProfile>('/auth/me')
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
