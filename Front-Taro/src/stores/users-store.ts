 import { create } from 'zustand'
 import { usersService } from '../services/users-service'
 import type { UserItem } from '../types/user'
 
 interface UsersState {
   users: UserItem[]
   total: number
   page: number
   isLoading: boolean
   hasMore: boolean
   error: string | null
 
   loadUsers: (refresh?: boolean) => Promise<void>
   clearUsers: () => void
 }
 
 export const useUsersStore = create<UsersState>((set, get) => ({
   users: [],
   total: 0,
   page: 1,
   isLoading: false,
   hasMore: true,
   error: null,
 
   loadUsers: async (refresh = false) => {
     const state = get()
     if (state.isLoading || (!refresh && !state.hasMore)) return
 
     const page = refresh ? 1 : state.page
     set({ isLoading: true, error: null })
 
     try {
       const result = await usersService.getUsers(page)
       set({
         users: refresh ? result.items : [...state.users, ...result.items],
         total: result.total,
         page: page + 1,
         isLoading: false,
         hasMore: page * 20 < result.total,
       })
     } catch (err: any) {
       set({ error: err.message || 'Failed to load users', isLoading: false })
     }
   },
 
   clearUsers: () => set({ users: [], total: 0, page: 1, hasMore: true, error: null }),
 }))
