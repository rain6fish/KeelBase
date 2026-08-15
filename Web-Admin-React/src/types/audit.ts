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
