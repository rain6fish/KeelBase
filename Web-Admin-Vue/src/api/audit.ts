import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AuditLog, UsageStats } from '@/types/audit'
import type { OperationAuditLog } from '@/types/admin'

export const auditApi = {
  logs(params: { userId?: string; limit?: number; offset?: number; since?: string } = {}): Promise<AuditLog[]> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset
    if (params.since) query.since = params.since
    return api.get<AuditLog[]>('/audit/logs', query)
  },
  stats(since?: string): Promise<UsageStats> {
    return api.get<UsageStats>('/audit/stats', { ...(since ? { since } : {}) })
  },
  /** HS-11 审计哈希链完整性校验 */
  verify(): Promise<{ valid: boolean; brokenIndex?: number; total?: number }> {
    return api.get('/audit/verify')
  },
  opLogs(page = 1, limit = 20, userId?: string, since?: string): Promise<Paginated<OperationAuditLog>> {
    return api.get<Paginated<OperationAuditLog>>('/audit/operations/logs', {
      page,
      limit,
      ...(userId ? { userId } : {}),
      ...(since ? { since } : {}),
    })
  },
}
