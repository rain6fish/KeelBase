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
