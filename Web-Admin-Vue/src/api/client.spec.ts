// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { ApiError, isActionableApiError, isEmailNotVerified, normalizeError } from './client'

describe('ApiError', () => {
  it('构造时保存状态码与业务码', () => {
    const err = new ApiError('邮箱未验证', 403, 'EMAIL_NOT_VERIFIED')
    expect(err.statusCode).toBe(403)
    expect(err.errorCode).toBe('EMAIL_NOT_VERIFIED')
    expect(err.message).toBe('邮箱未验证')
  })

  it('缺省参数默认值', () => {
    const err = new ApiError('出错了', 500)
    expect(err.errorCode).toBeUndefined()
  })
})

describe('isEmailNotVerified', () => {
  it('匹配 EMAIL_NOT_VERIFIED 返回 true', () => {
    const err = new ApiError('x', 403, 'EMAIL_NOT_VERIFIED')
    expect(isEmailNotVerified(err)).toBe(true)
  })

  it('其他错误返回 false', () => {
    expect(isEmailNotVerified(new ApiError('x', 403))).toBe(false)
    expect(isEmailNotVerified(new Error('普通错误'))).toBe(false)
    expect(isEmailNotVerified('string')).toBe(false)
  })
})

/** 模拟 axios 异常（只带 normalizeError 读的那两层） */
function axiosError(status: number, data: unknown) {
  return { response: { status, data }, message: 'Request failed' }
}

describe('normalizeError · 拒绝指引（403 / 确认 404）', () => {
  const explanation = {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.tool_disabled.reason',
    nextStepKey: 'ai.deny.tool_disabled.nextStep',
    reason: '治理策略已禁用工具 send_email。',
    nextStep: '请管理员在策略中心启用该工具后重试。',
    params: { tool: 'send_email' },
  }

  it('403 的 explanation → reason/nextStep 落到 ApiError（错误卡可读）', () => {
    const err = normalizeError(axiosError(403, { message: 'Forbidden', explanation }))
    expect(err.statusCode).toBe(403)
    expect(err.reason).toBe(explanation.reason)
    expect(err.nextStep).toBe(explanation.nextStep)
    // 已有具体指引 ⇒ 不再追加泛化引导（同一句话不出现两遍）
    expect(err.message).toBe('Forbidden')
    expect(isActionableApiError(err)).toBe(true)
  })

  it('确认 404 的 explanation → 同样落地（为什么 + 怎么恢复）', () => {
    const invalid = {
      deniedBy: 'confirmation',
      reasonKey: 'ai.deny.confirmation_invalid.reason',
      nextStepKey: 'ai.deny.confirmation_invalid.nextStep',
      reason: '确认请求不存在、已过期、已被裁决，或不属于当前账号。',
      nextStep: '请重新发起该操作。',
    }
    const err = normalizeError(axiosError(404, { message: 'Not Found', explanation: invalid }))
    expect(err.statusCode).toBe(404)
    expect(err.reason).toBe(invalid.reason)
    expect(err.nextStep).toBe(invalid.nextStep)
  })

  it('403 无 explanation（旧服务端）→ 仍追加泛化引导', () => {
    const err = normalizeError(axiosError(403, { message: 'Forbidden' }))
    expect(err.message.startsWith('Forbidden')).toBe(true)
    expect(err.message.length).toBeGreaterThan('Forbidden'.length)
    expect(err.reason).toBeUndefined()
  })

  it('顶层 NC-2 字段优先于 explanation（既有形状不被改写）', () => {
    const err = normalizeError(
      axiosError(403, { message: 'Forbidden', reason: '顶层原因', nextStep: '顶层下一步', explanation }),
    )
    expect(err.reason).toBe('顶层原因')
    expect(err.nextStep).toBe('顶层下一步')
  })
})

describe('isActionableApiError（NC-2 可执行错误）', () => {
  it('带 reason/impact/nextStep 任一 → true', () => {
    const err = new ApiError('AI 服务暂不可用', 502, 'LLM_UNAVAILABLE')
    err.reason = '没有可用的模型 provider'
    err.nextStep = '检查 API Key 配置'
    expect(isActionableApiError(err)).toBe(true)
  })

  it('无三字段或非 ApiError → false', () => {
    expect(isActionableApiError(new ApiError('x', 400))).toBe(false)
    expect(isActionableApiError(new Error('普通错误'))).toBe(false)
    expect(isActionableApiError('string')).toBe(false)
  })
})
