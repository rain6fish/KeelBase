// SPDX-License-Identifier: Apache-2.0

/**
 * 统一响应信封 / 错误体 adapter —— 对齐 CE-1 wire Contract v1
 * （Server-NestJS/specs/protocol/schemas/v1/{api-response,error-body}.schema.json）。
 *
 * FE-1（前端 Runtime-Neutrality，ADR-0002 Rev-8）：前端只经本模块解包与归一响应形状，
 * 业务代码零后端（NestJS）形状假设；切换 Runtime（如 Java）时只替换本 adapter 与
 * session adapter，不动业务代码。
 */

/** 成功信封（api-response）：code/message/data/timestamp 恒存在（data 可为 null） */
export interface ApiEnvelope<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
}

/**
 * 错误体（error-body）：与成功信封同构 + 可选取值；data 恒 null。
 * 注意：契约无 `errors` 字典——validator 错误已以 '; ' join 进 message。
 */
export interface ApiErrorBody {
  code: number
  message: string
  data: null
  timestamp: string
  errorCode?: string
  reason?: string
  impact?: string
  nextStep?: string
  /** W5-⑦ Explainable Authz（403）：为何阻止依据（object 或纯文本） */
  explanation?: Record<string, unknown> | string
  retryAfter?: number
}

/** 解包成功信封：契约保证 data 恒存在（可能 null）；非信封（@Raw 端点）原样返回 */
export function unwrapEnvelope<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as ApiEnvelope<T>).data
  }
  return body as T
}

/** 归一错误体：按 error-body 契约取顶层字段（缺省 undefined，不臆造契约外字段） */
export interface NormalizedErrorBody {
  message?: string
  errorCode?: string
  reason?: string
  impact?: string
  nextStep?: string
  explanation?: Record<string, unknown> | string
  retryAfter?: number
}

export function readErrorBody(raw: unknown): NormalizedErrorBody {
  if (!raw || typeof raw !== 'object') return {}
  const b = raw as Partial<ApiErrorBody>
  return {
    message: typeof b.message === 'string' ? b.message : undefined,
    errorCode: typeof b.errorCode === 'string' ? b.errorCode : undefined,
    reason: typeof b.reason === 'string' ? b.reason : undefined,
    impact: typeof b.impact === 'string' ? b.impact : undefined,
    nextStep: typeof b.nextStep === 'string' ? b.nextStep : undefined,
    explanation: b.explanation,
    retryAfter: typeof b.retryAfter === 'number' ? b.retryAfter : undefined,
  }
}

/** W5-⑦：从 explanation 取 deniedBy（explanation 可为 object 或 string，string 时无依据） */
export function deniedByOf(explanation: Record<string, unknown> | string | undefined): string | undefined {
  if (explanation && typeof explanation === 'object' && typeof explanation.deniedBy === 'string') {
    return explanation.deniedBy
  }
  return undefined
}
