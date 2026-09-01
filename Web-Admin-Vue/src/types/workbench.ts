// SPDX-License-Identifier: Apache-2.0

/** 工作台（应用侧）本人数据模型 —— 对应后端 user-scoped 端点 */

export interface MyEvent {
  id: number
  title: string
  description?: string | null
  startTime: string
  endTime: string
  location?: string | null
  colorRole?: number
  isCancelled: boolean
  isRecurring: boolean
  reminderMinutes?: number | null
  createdAt?: string
}

export interface MyTodo {
  id: number
  title: string
  description?: string | null
  completed: boolean
  dueDate?: string | null
  createdAt?: string
}

export interface MyNotification {
  id: number
  title: string
  body?: string | null
  type: string
  targetType?: string | null
  targetId?: string | number | null
  isRead: boolean
  link?: string | null
  createdAt?: string
}

export interface MyEventQuery {
  keyword?: string
  start?: string
  end?: string
  page?: number
  limit?: number
}

export interface CreateTodoInput {
  title: string
  description?: string
  dueDate?: string
}

// P0-14 Agent Decision Trace：本人 AI 对话执行轨迹
export interface TraceEffect {
  effectId: number
  resultType: string
  resultId: number
  targetTitle?: string | null
  revocable: boolean
  /** E-1 字段级变更审计：before/after 快照（JSON 字符串；create 类 before 为 null） */
  before?: string | null
  after?: string | null
}

export type TraceStepType = 'input' | 'assistant' | 'tool_call' | 'confirmation' | 'effect' | 'notice'

export interface TraceStep {
  id: string
  type: TraceStepType
  time: string
  toolName?: string
  args?: string
  success?: boolean
  errorMessage?: string | null
  /** W5-⑦ Explainable Authz：工具被拒时检查清单（为何阻止） */
  checks?: Array<{ name: string; ok: boolean; note?: string }>
  outcome?: 'approve' | 'decline' | 'timeout'
  trusted?: boolean
  content?: string
  detail?: string | null
  model?: string
  provider?: string
  tokens?: number
  effect?: TraceEffect
  /** D4 多 Agent 归责：执行该步骤的子 agent / 调用方 agent */
  agentId?: string
  callerAgentId?: string
  /** §22.16 A-1 业务事件名（CustomerRiskAssessed 等） */
  businessEvent?: string | null
  /** §22.16 A-1 Decision Evidence（JSON 字符串：{decision, evidence[], policy, confidence}） */
  evidence?: string | null
}

/** §22.16 A-1 Decision Evidence：AI 决策依据（不记 CoT） */
export interface DecisionEvidence {
  decision: string
  evidence: string[]
  policy: string
  confidence: number
}

export interface ConversationSummary {
  id: string
  provider: string
  model: string
  summary?: string | null
  createdAt: string
  lastActivityAt: string
  messages: Array<{ role: string; content: string; timestamp: string }>
}

export interface TraceResponse {
  conversation: ConversationSummary
  steps: TraceStep[]
}
