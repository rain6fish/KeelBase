// SPDX-License-Identifier: Apache-2.0

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
  /** AU-3（§22.19 归因层）：访客标识——区分共享演示账号（alex）下的不同访客；链外列 */
  guestId?: string | null
  /** §internal.16 A-1 业务事件名（CustomerRiskAssessed 等） */
  businessEvent?: string | null
  /** §internal.16 A-1 Decision Evidence（JSON 字符串） */
  evidence?: string | null
  /** §internal.16 A-5 跨系统身份链：D4 委托链字段 */
  parentActionId?: string | null
  callerAgentId?: string | null
  businessIntent?: string | null
  source?: string | null
}

/** §internal.16 A-5 跨系统身份链：Human→Intent→Agent→Tool→Action + 授权依据 */
export interface IdentityChain {
  human: { userId: string; username: string | null }
  intent: string | null
  agent: { agentId: string | null; agentName: string | null; trustLevel: string | null; callerAgentId: string | null }
  tool: { toolName: string | null }
  action: { businessEvent: string | null; evidence: string | null }
  source: string | null
  authorization: {
    denied: Array<{ name: string; ok: boolean; note?: string }> | null
    allowed: Record<string, unknown> | null
  }
  chain: Array<{ id: number; action: string; toolName: string | null; businessEvent?: string | null; agentId?: string | null; createdAt: string }>
}

/**
 * P0-20：解释面上**那一个**状态。与后端 `audit-explanation-state.ts` 同源；视图只用它选标签与颜色。
 *
 * P0-20: the one state the explanation surface shows. Same vocabulary as the back end's
 * `audit-explanation-state.ts`; the view only uses it to pick a label and a colour.
 */
export type ExplanationState =
  | 'awaiting_confirmation'
  | 'compensation_failed'
  | 'compensation_succeeded'
  | 'compensating'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'result_unknown'

/**
 * §internal.16 A-4 审计解释器 + P0-20 单事件解释面。
 *
 * <p>⚠ 这里曾经写错过一次，且值得记下：本接口原写作 `{ summary: {sentence,…}, stats }`，而线上
 * 返回 `{ row, summary, conversation }`，其中 `summary` **就是那个（平的）解释** —— 于是
 * `summary.sentence` 恰好读得到，`stats` 却**恒为 `undefined`** ⇒「查看证据 / 决策证据」整块
 * **静默不渲染**（`v-if` 短路，连错都不报），而「为什么允许」的直接证据正住在那一块里。形状现按
 * 线上改平，`stats` 移到它真正的住处。
 *
 * §internal.16 A-4 interpreter + P0-20 single-event explanation.
 *
 * <p>This interface was wrong once, and that is worth recording: it claimed `{ summary: {sentence,…},
 * stats }` while the wire answers `{ row, summary, conversation }`, where `summary` **is** that (flat)
 * interpretation. `summary.sentence` therefore resolved by luck and `stats` was permanently
 * `undefined` — so the evidence block, which is where "why was it allowed" actually lives, never
 * rendered: the `v-if` short-circuited and nothing complained. The shape now follows the wire, and
 * `stats` sits where it really is.
 */
export interface AuditInterpretation {
  /**
   * The audit row the explanation is about. The wire carries the whole row; the view reads only its
   * **chain position** — and this is where those two columns are available, because the list row the
   * table holds does not carry them.
   *
   * 解释所关于的那条审计行。线上带的是整行，而视图只读它的**链位** —— 也正是这两列**在这里**才拿得到
   * （表格持有的那种列表行不带它们）。
   */
  row: { id: number; hash?: string | null; prevHash?: string | null }
  summary: {
    sentence: string
    key: string | null
    businessEvent: string | null
    stats: {
      businessEvents: Array<{ event: string; count: number }>
      evidence: Array<{ decision?: string; evidence?: string[]; policy?: string; confidence?: number }>
      confirmations: { approved: number; declined: number }
      blocked: number
      errors: number
    }
    /** D-3：仅当该行有授权快照时附上；视图暂未渲染，故只做宽松标注。 */
    decisionNote?: Record<string, unknown> | null
  }
  /** The rows of the same conversation the interpretation summarised. */
  conversation: Array<{
    id: number
    action: string
    detail?: string | null
    businessEvent?: string | null
    evidence?: string | null
    isError: boolean
    errorMessage?: string | null
    createdAt: string
  }>
  /** P0-20：**一个**状态，由后端算一次（见 `ExplanationState`）。 */
  state: ExplanationState
  /** The side effect this action produced, when it produced one. */
  effect: {
    id: number
    toolName: string
    resultType: string
    resultId: number
    revokeClass: string | null
    revokeStatus: string | null
    revokeWindow: string | null
    /** JSON strings, handed to `FieldDiff` as-is. */
    before: string | null
    after: string | null
  } | null
  /** P0-20：业务那一腿 —— 该动作引起的操作审计行（同一条时间线里的另一半）。 */
  operationAudit: Array<{ seq: number; id: number; prevHash: string | null; hash: string; payload: unknown }>
  /** P0-20：谁批准 —— 经占位行的 token 找到的确认记录。 */
  approval: {
    token: string
    toolName: string
    riskLevel: string
    kind: string | null
    status: string
    approverId: string | null
    decidedAt: string | null
    expiresAt: string | null
  } | null
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
    /** §internal.16 A-6 合规：Decision Evidence + 责任链展示字段 */
    businessEvent?: string | null
    evidence?: string | null
    agentId?: string | null
    createdAt: string
  }>
}

/**
 * AW-3 coverage statement. The shape is the backend's, verbatim — the console renders `gaps[].id`
 * through i18n and falls back to `gaps[].statement` (English) when an entry has no translation yet.
 *
 * `AW-3` 覆盖声明。形状逐字照后端 —— 控制台按 `gaps[].id` 取 i18n，没有词条时回落到
 * `gaps[].statement`（英文）。
 */
export interface CoverageStatement {
  /** 这份声明是按**哪一版**缺口登记表算出来的（登记表内容的前 12 hex）。 */
  registryRevision: string
  scope: { kind: 'period'; since: string; to: string; subjectRef: string | null }
  sources: Array<{ id: string; state: 'complete' | 'partial' | 'absent' | 'unreachable'; rows: number | null }>
  verdict: 'complete' | 'partial' | 'unknown'
  gaps: Array<{ id: string; severity: 'high' | 'medium' | 'low'; affects: string; statement: string }>
}
