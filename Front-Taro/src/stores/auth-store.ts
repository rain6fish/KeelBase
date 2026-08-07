 import { create } from 'zustand'
 import { authService } from '../services/auth-service'
 import { setOnAuthFailure } from '../services/api-client'
 import type { User, AuthStatus } from '../types/auth'
 
 interface AuthState {
   status: AuthStatus
   user: User | null
   errorMessage: string | null
 
   // Actions
   tryAutoLogin: () => Promise<void>
   login: (username: string, password: string) => Promise<boolean>
   register: (username: string, password: string, nickname: string) => Promise<boolean>
   logout: () => Promise<void>
   clearError: () => void
 }
 
 export const useAuthStore = create<AuthState>((set, get) => {
   // Register the auth failure callback
   setOnAuthFailure(() => {
     set({ user: null, status: 'unauthenticated', errorMessage: null })
   })
 
   return {
     status: 'initial',
     user: null,
     errorMessage: null,
 
     tryAutoLogin: async () => {
       set({ status: 'loading' })
       const hasToken = await authService.isAuthenticated()
       if (!hasToken) {
         set({ status: 'unauthenticated' })
         return
       }
       try {
         const profile = await authService.getProfile()
         set({
           user: { id: profile.id, username: profile.username, nickname: profile.nickname },
           status: 'authenticated',
         })
       } catch {
         await authService.logout()
         set({ status: 'unauthenticated' })
       }
     },
 
     login: async (username, password) => {
       set({ status: 'loading', errorMessage: null })
       try {
         const response = await authService.login(username, password)
         set({ user: response.user, status: 'authenticated' })
         return true
       } catch (err: any) {
         set({ status: 'error', errorMessage: err.message || 'Login failed' })
         return false
       }
     },
 
     register: async (username, password, nickname) => {
       set({ status: 'loading', errorMessage: null })
       try {
         const response = await authService.register(username, password, nickname)
         set({ user: response.user, status: 'authenticated' })
         return true
       } catch (err: any) {
         set({ status: 'error', errorMessage: err.message || 'Registration failed' })
         return false
       }
     },
 
     logout: async () => {
       await authService.logout()
       set({ user: null, status: 'unauthenticated', errorMessage: null })
     },
 
     clearError: () => set({ errorMessage: null }),
   }
 })
