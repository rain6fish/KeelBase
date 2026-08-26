import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AuditLog, UsageStats, ActionReport } from '@/types/audit'
import type { OperationAuditLog } from '@/types/admin'

export const auditApi = {
  logs(params: { userId?: string; agentId?: string; limit?: number; offset?: number; since?: string } = {}): Promise<AuditLog[]> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.agentId) query.agentId = params.agentId
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
  /** §10 P1 AI Action Report：合规证据包（执行/批准/拒绝/阻断 + 副作用 + 哈希链） */
  actionReport(params: { userId?: string; since?: string; limit?: number } = {}): Promise<ActionReport> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.since) query.since = params.since
    if (params.limit != null) query.limit = params.limit
    return api.get<ActionReport>('/audit/action-report', query)
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
