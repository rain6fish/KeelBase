export interface AuditLog {
  id: number
  userId: string
  conversationId?: string | null
  action: string
  detail?: string | null
  model?: string | null
  provider?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  durationMs?: number | null
  isError: boolean
  errorMessage?: string | null
  /** W5-⑦ Explainable Authz：AuthorizationDeniedError.reasons 的 JSON（checks） */
  authorization?: string | null
  createdAt: string
  /** 所属用户名（管理端审计 JOIN 用户表返回） */
  username?: string | null
}

export interface UsageStats {
  totalConversations: number
  totalMessages: number
  totalTokens: number
  totalErrors: number
  topActions: Array<{ action: string; count: number }>
}

/** §10 P1 AI Action Report：合规证据包 */
export interface ActionReport {
  period: { since: string | null; to: string }
  summary: {
    executed: number
    approved: number
    rejected: number
    blocked: number
    errors: number
    effects: number
  }
  byAction: Array<{ action: string; count: number }>
  /** B3 时间趋势：按日聚合执行/批准/拒绝/阻断/错误（升序） */
  byDay: Array<{ date: string; executed: number; approved: number; rejected: number; blocked: number; errors: number }>
  hashChain: { valid: boolean; checked: number; brokenIndex: number | null }
  samples: Array<{
    id: number
    action: string
    toolName: string | null
    isError: boolean
    errorMessage?: string | null
    createdAt: string
  }>
}
