export interface AuditLog {
  id: number
  userId: string
  conversationId?: string | null
  action: string
  actionKey?: string | null
  actionLabel?: string | null
  /** W4-⑤ Agent Identity：调用方 agent（Agent Registry name 归责于此） */
  agentId?: string | null
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
  /** §22.16 A-1 业务事件名（CustomerRiskAssessed 等） */
  businessEvent?: string | null
  /** §22.16 A-1 Decision Evidence（JSON 字符串） */
  evidence?: string | null
}

/** B3/E-2 按 UTC 日聚合的趋势桶（5 段：执行/批准/拒绝/阻断/错误） */
export interface AuditByDayBucket {
  date: string
  executed: number
  approved: number
  rejected: number
  blocked: number
  errors: number
}

export interface UsageStats {
  totalConversations: number
  totalMessages: number
  totalTokens: number
  totalErrors: number
  topActions: Array<{ action: string; count: number }>
  /** E-2 趋势：按 UTC 日聚 5 段 */
  byDay: AuditByDayBucket[]
}

/** E-2 哈希链可视化：逐行链节点（verify 端点返回的切片；AI 链有 toolName，op 链有 method/path） */
export interface HashNode {
  id: number
  createdAt: string
  action: string
  toolName?: string | null
  method?: string
  path?: string
  statusCode?: number | null
  prevHash: string | null
  hash: string | null
  isError?: boolean
  /** 断链行（prevHash 不连续 / hash 不符） */
  broken?: boolean
}

/** HS-11 审计哈希链校验结果（含逐行链切片） */
export interface ChainVerifyResult {
  valid: boolean
  checked: number
  brokenIndex?: number | null
  chain: HashNode[]
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
  byDay: AuditByDayBucket[]
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
