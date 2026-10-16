// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AuditLog, UsageStats, ActionReport, ChainVerifyResult, AuditInterpretation, IdentityChain, CoverageStatement } from '@/types/audit'
import type { OperationAuditLog } from '@/types/admin'

/** D4/A-6 审计证据包导出（GET /audit/action-report/export；v2 含 compliance 合规段） */
export interface ActionReportExport {
  exportedAt: string
  generator: string
  format: string
  report: ActionReport
  /** §internal.16 A-6 合规：samples 每条的业务摘要 + 责任链 + 授权依据（签名覆盖） */
  compliance: Array<{
    id: number
    businessEvent: string | null
    evidence: string | null
    summary: { sentence: string; stats: unknown } | null
    identityChain: unknown | null
  }>
  chain: Array<{ seq: number; id: number; prevHash: string | null; hash: string; payload: Record<string, unknown> }>
  signature: string | null
}

export const auditApi = {
  logs(params: { userId?: string; agentId?: string; limit?: number; offset?: number; since?: string; isError?: 'true' | 'false'; denied?: 'true' } = {}): Promise<AuditLog[]> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.agentId) query.agentId = params.agentId
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset
    if (params.since) query.since = params.since
    if (params.isError) query.isError = params.isError
    if (params.denied) query.denied = params.denied
    return api.get<AuditLog[]>('/audit/logs', query)
  },
  stats(since?: string): Promise<UsageStats> {
    return api.get<UsageStats>('/audit/stats', { ...(since ? { since } : {}) })
  },
  /** HS-11 审计哈希链完整性校验（E-2：含链切片，前端可视化断链点） */
  verify(): Promise<ChainVerifyResult> {
    return api.get<ChainVerifyResult>('/audit/verify')
  },
  /** §internal.16 A-4 审计解释器：单行审计 → 业务摘要 + 证据统计 */
  interpretation(id: number): Promise<AuditInterpretation> {
    return api.get(`/audit/logs/${id}/interpretation`)
  },
  /** §internal.16 A-5 跨系统身份链：Human→Agent→Tool→Action + 授权依据 */
  chain(id: number): Promise<IdentityChain> {
    return api.get(`/audit/logs/${id}/chain`)
  },
  /**
   * AW-3 覆盖声明：这个口径读了什么、**看不了**什么。每一条缺口都来自后端的登记表
   * （`ai/audit/coverage-gaps.ts`），故往那里加一条，这里自动多一条。
   */
  coverage(params: { since?: string; until?: string; userId?: string } = {}): Promise<CoverageStatement> {
    const query: Record<string, string> = {}
    if (params.since) query.since = params.since
    if (params.until) query.until = params.until
    if (params.userId) query.userId = params.userId
    return api.get<CoverageStatement>('/audit/coverage', query)
  },
  /** §10 P1 AI Action Report：合规证据包（执行/批准/拒绝/阻断 + 副作用 + 哈希链） */
  actionReport(params: { userId?: string; since?: string; limit?: number } = {}): Promise<ActionReport> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.since) query.since = params.since
    if (params.limit != null) query.limit = params.limit
    return api.get<ActionReport>('/audit/action-report', query)
  },
  /** D4 审计证据包导出：ActionReport + 哈希链校验 + 时间戳 + 签名 */
  exportActionReport(params: { userId?: string; since?: string; limit?: number } = {}): Promise<ActionReportExport> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.since) query.since = params.since
    if (params.limit != null) query.limit = params.limit
    return api.get<ActionReportExport>('/audit/action-report/export', query)
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
