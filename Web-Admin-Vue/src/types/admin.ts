export interface MonitorSummary {
  health: {
    status: string
    uptimeSec: number
    nodeEnv?: string
    version: string
  }
  dependencies: {
    database: string
    redis: string
    queue: string
    storage: string
    mail: string
    push: string
  }
  counts: {
    users: number
    events: number
    notifications: number
    sessions: number
    operationAuditLogs: number
    aiAuditLogs: number
    conversations: number
    knowledge: number
  }
  metrics: {
    requestRateRps: number | null
    errorRatePct: number | null
    latencyP95Ms: number | null
    inFlight: number | null
  }
}

export interface PlatformOverview {
  counts: {
    users: number
    events: number
    todos: number
    notifications: number
    operationAuditLogs: number
    aiAuditLogs: number
  }
  storage: {
    driver: string
    bytes: number | null
  }
  trend: Array<{ date: string; count: number }>
}

export interface AdminSession {
  id: number
  userId: number
  username: string | null
  deviceName: string | null
  ip: string | null
  createdAt: string | null
  lastActiveAt: string | null
}

export interface BroadcastResult {
  sent: number
  mode: 'selected' | 'all'
}

export interface OperationAuditLog {
  id: number
  userId?: number | null
  action: string
  method: string
  path: string
  /** 功能语义 key（如 users.create），前端按语言渲染为功能名 */
  featureKey?: string | null
  /** 兜底英文功能名 */
  featureFallback?: string | null
  targetId?: string | null
  requestBody?: string | null
  ip?: string | null
  userAgent?: string | null
  statusCode?: number | null
  createdAt: string
  /** 所属用户名（管理端审计 JOIN 用户表返回） */
  username?: string | null
}

export interface KnowledgeArticle {
  id: number
  title: string
  content: string
  category?: string | null
  sourceFile?: string | null
  fileUrl?: string | null
  docType?: string | null
  chunkCount?: number | null
  createdAt: string
  updatedAt: string
}

export interface AppVersionInfo {
  latestVersion: string
  minRequiredVersion: string
  updateUrl: string
  changelog: string[]
}

export interface UserDetail {
  id: number
  username: string
  email: string
  phone?: string | null
  role: string
  nickname: string
  emailVerified?: boolean
  createdAt?: string
  updatedAt?: string
  sessions: Array<{
    id: number
    deviceName: string | null
    ip: string | null
    lastActiveAt: string | null
    createdAt: string | null
  }>
  notifications: Array<{
    id: number
    title: string
    body: string | null
    type: string
    isRead: boolean
    createdAt: string | null
  }>
  counts: {
    events: number
    operationAuditLogs: number
    aiAuditLogs: number
    totalTokens: number
  }
}

// ---- P3 新增 ----

export interface TrashItem {
  type: 'event' | 'todo'
  id: number
  title: string
  userId: number | null
  username: string | null
  deletedAt: string | null
}

export interface TrashResponse {
  items: TrashItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface TrashRestoreResult {
  restored: boolean
  type: 'event' | 'todo'
  id: number
}

export interface AnalyticsResponse {
  period: { days: number }
  activeUsers: {
    daily: Array<{ date: string; count: number }>
    wau: number
    mau: number
    totalUsers: number
  }
  retention: {
    ratePct: number
    retained: number
    activeLast30d: number
  }
  featureFunnel: Array<{ action: string; count: number }>
  errors: {
    aiErrors: number
    trend: Array<{ date: string; count: number }>
  }
}

export interface ImportResult {
  type: 'user' | 'event' | 'todo'
  total: number
  success: number
  failed: number
  errors: Array<{ row: number; reason: string }>
}

export interface AdminTemplate {
  id: string
  name: string
  description: string
  events: Array<{
    title: string
    description?: string
    startTime: string
    endTime: string
    location?: string
    isCancelled?: boolean
    reminderMinutes?: number
  }>
  todos: Array<{
    title: string
    description?: string
    completed?: boolean
    dueDate?: string
  }>
}

export interface TemplateImportResult {
  template: string
  targetUserId: number
  events: number
  todos: number
}

export interface AdminAiTool {
  name: string
  description: string
  parameters: Array<{ name: string; type: string; required: boolean }>
  enabled: boolean
  requiresConfirmation: boolean
  allowedRoles: string[]
  permissions: {
    requireVerifiedEmail?: boolean
    featureFlag?: string
    adminOnly?: boolean
  } | null
}

export interface SettingRow {
  key: string
  value: string
  type: 'string' | 'number' | 'boolean'
}

export interface ToolEffect {
  id: number
  toolName: string
  conversationId: string | null
  resultType: 'event' | 'todo'
  resultId: number
  argsHash: string
  createdAt: string
  targetExists: boolean
  targetSoftDeleted: boolean
  targetTitle: string | null
}

export interface ToolEffectsResponse {
  total: number
  page: number
  limit: number
  items: ToolEffect[]
}

export interface OpsAlert {
  level: 'critical' | 'warning'
  title: string
  detail: string
}

export interface OpsSummary {
  alerts: OpsAlert[]
  metrics: {
    requestRateRps: number | null
    errorRatePct: number | null
    latencyP95Ms: number | null
    inFlight: number | null
  }
  logErrors: {
    since: string
    opErrors: Array<{ code: number; count: number }>
    aiErrors: number
  }
  trend: Array<{ day: string; total: number; errors: number }>
}

// System AI Assistant（管理端 AI 助手）
export interface AdminAiChatRequest {
  message: string
  conversationId?: string
}

export interface AdminAiChatResponse {
  reply: string
  conversationId: string
  navigateTo?: string
  toolCalls?: string[]
}
