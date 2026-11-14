// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AuditLog, AuditAnswerMatrix, UsageStats, ActionReport, ChainVerifyResult, AuditInterpretation, IdentityChain, CoverageStatement, AuditReviewStatus, ToolResultBody } from '@/types/audit'
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
  logs(params: { userId?: string; agentId?: string; limit?: number; offset?: number; since?: string; until?: string; isError?: 'true' | 'false'; denied?: 'true'; objectType?: string; objectId?: number } = {}): Promise<AuditLog[]> {
    const query: Record<string, string | number> = {}
    if (params.userId) query.userId = params.userId
    if (params.agentId) query.agentId = params.agentId
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset
    if (params.since) query.since = params.since
    if (params.until) query.until = params.until
    if (params.isError) query.isError = params.isError
    if (params.denied) query.denied = params.denied
    if (params.objectType) query.objectType = params.objectType
    if (params.objectId != null) query.objectId = params.objectId
    return api.get<AuditLog[]>('/audit/logs', query)
  },
  /**
   * U1：六问导出。`rows` 已经是六个产品词，控制台只负责写 CSV —— 内部名不可能在这里被「顺带加上」。
   *
   * U1: the six-answer export. `rows` are already six product words; the console only writes the
   * CSV, so an internal name cannot be «added along the way» here.
   */
  answers(params: { objectType?: string; objectId?: number; since?: string; until?: string; limit?: number } = {}): Promise<AuditAnswerMatrix> {
    const query: Record<string, string | number> = {}
    if (params.objectType) query.objectType = params.objectType
    if (params.objectId != null) query.objectId = params.objectId
    if (params.since) query.since = params.since
    if (params.until) query.until = params.until
    if (params.limit != null) query.limit = params.limit
    return api.get<AuditAnswerMatrix>('/audit/answers', query)
  },
  /**
   * U1：可检索的业务对象类型。与导出同一个词表 —— 选择器和 CSV 不会把同一个对象叫成两个名字。
   *
   * U1: the searchable business object types, from the export's own vocabulary, so the picker and
   * the CSV cannot name the same object differently.
   */
  objectTypes(): Promise<Array<{ value: string; label: string }>> {
    return api.get<Array<{ value: string; label: string }>>('/audit/object-types')
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
   * 0-B：留存的结果正文。未留存的调用返回 404（「什么都没留」是答案，不是空正文）。
   *
   * 0-B: the retained result body. A call with nothing retained answers 404 — «nothing was kept» is
   * the answer, not an empty body.
   */
  toolResult(id: number): Promise<ToolResultBody> {
    return api.get<ToolResultBody>(`/audit/logs/${id}/tool-result`)
  },
  /**
   * AW-12 复核状态：谁被指派读这些记录、多久一次、哪些链位已有回执、哪些没有。
   * 由链算出 —— 回执就是一条 `audit_review` 行。
   *
   * AW-12 review status: who is assigned to read these records, how often, which chain positions a
   * receipt covers and which ones nobody has attested to. Computed from the chain.
   */
  reviews(): Promise<AuditReviewStatus> {
    return api.get<AuditReviewStatus>('/audit/reviews')
  },
  /**
   * AW-3 覆盖声明：这个口径读了什么、**看不了**什么。每一条缺口都来自后端的登记表
   * （`governance-core/coverage-gaps.ts`），故往那里加一条，这里自动多一条。
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
