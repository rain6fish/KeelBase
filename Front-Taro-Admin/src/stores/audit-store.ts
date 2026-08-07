import { create } from 'zustand'
import { adminService } from '../services/admin-service'
import type { AuditLog, UsageStats } from '../types/audit'

interface AuditState {
  logs: AuditLog[]
  stats: UsageStats | null
  loading: boolean
  errorMessage: string | null

  fetchLogs: (params?: { userId?: string; limit?: number; offset?: number; since?: string }) => Promise<void>
  fetchStats: () => Promise<void>
}

export const useAuditStore = create<AuditState>((set) => ({
  logs: [],
  stats: null,
  loading: false,
  errorMessage: null,

  fetchLogs: async (params = {}) => {
    set({ loading: true, errorMessage: null })
    try {
      const logs = await adminService.getAuditLogs(params)
      set({ logs, loading: false })
    } catch (err: any) {
      set({ loading: false, errorMessage: err?.message || '加载审计日志失败' })
    }
  },

  fetchStats: async () => {
    try {
      const stats = await adminService.getAuditStats()
      set({ stats })
    } catch {
      // 统计失败不阻塞页面
    }
  },
}))
