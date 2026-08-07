 import { create } from 'zustand'
 import { sessionService } from '../services/session-service'
 import type { SessionItem } from '../types/session'

 interface SessionState {
   sessions: SessionItem[]
   isLoading: boolean
   error: string | null

   load: () => Promise<void>
   revoke: (id: number) => Promise<void>
 }

 export const useSessionStore = create<SessionState>((set, get) => ({
   sessions: [],
   isLoading: false,
   error: null,

   load: async () => {
     set({ isLoading: true, error: null })
     try {
       const sessions = await sessionService.getSessions()
       set({ sessions, isLoading: false })
     } catch (err: any) {
       set({ error: err.message || 'Failed to load sessions', isLoading: false })
     }
   },

   revoke: async (id) => {
     await sessionService.revokeSession(id)
     set({ sessions: get().sessions.filter((s) => s.id !== id) })
   },
 }))
