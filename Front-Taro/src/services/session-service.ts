 import { api } from './api-client'
 import type { SessionItem } from '../types/session'

 export const sessionService = {
   async getSessions(): Promise<SessionItem[]> {
     const res = await api.get<SessionItem[]>('/auth/sessions')
     return res.data ?? []
   },

   async revokeSession(id: number): Promise<void> {
     await api.delete(`/auth/sessions/${id}`)
   },
 }
