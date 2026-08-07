import { create } from 'zustand'
import { adminService } from '../services/admin-service'
import type { AdminUser, UserRole } from '../types/user'

interface UsersState {
  items: AdminUser[]
  total: number
  page: number
  limit: number
  keyword: string
  loading: boolean
  errorMessage: string | null

  fetch: (page?: number, keyword?: string) => Promise<void>
  updateRole: (id: number, role: UserRole) => Promise<void>
  remove: (id: number) => Promise<void>
  setKeyword: (kw: string) => void
}

export const useUsersStore = create<UsersState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  keyword: '',
  loading: false,
  errorMessage: null,

  fetch: async (page?: number, keyword?: string) => {
    set({ loading: true, errorMessage: null })
    try {
      const nextPage = page ?? get().page
      const nextKeyword = keyword ?? get().keyword
      const res = await adminService.getUsers(nextPage, get().limit, nextKeyword || undefined)
      set({ items: res.items, total: res.total, page: nextPage, keyword: nextKeyword, loading: false })
    } catch (err: any) {
      set({ loading: false, errorMessage: err?.message || '加载用户失败' })
    }
  },

  updateRole: async (id, role) => {
    await adminService.updateUserRole(id, role)
    set({
      items: get().items.map((u) => (u.id === id ? { ...u, role } : u)),
    })
  },

  remove: async (id) => {
    await adminService.deleteUser(id)
    set({ items: get().items.filter((u) => u.id !== id), total: get().total - 1 })
  },

  setKeyword: (kw) => set({ keyword: kw }),
}))
