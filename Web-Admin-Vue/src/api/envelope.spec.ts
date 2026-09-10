// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { unwrapEnvelope, readErrorBody, deniedByOf } from './envelope'

describe('unwrapEnvelope（对齐 api-response.schema.json）', () => {
  it('信封 → 返回 data', () => {
    expect(unwrapEnvelope({ code: 200, message: 'ok', data: { id: 1 }, timestamp: 'x' })).toEqual({ id: 1 })
  })

  it('data 为 null → 返回 null（契约 data 恒存在）', () => {
    expect(unwrapEnvelope({ code: 200, message: 'ok', data: null, timestamp: 'x' })).toBeNull()
  })

  it('非信封（@Raw 端点/裸体）→ 原样返回', () => {
    expect(unwrapEnvelope('raw')).toBe('raw')
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2])
  })
})

describe('readErrorBody（对齐 error-body.schema.json）', () => {
  it('取顶层契约字段（message/errorCode/reason/impact/nextStep/retryAfter）', () => {
    const b = readErrorBody({
      code: 403,
      message: '无权访问',
      data: null,
      timestamp: 'x',
      errorCode: 'EMAIL_NOT_VERIFIED',
      reason: '邮箱未验证',
      impact: '无法写操作',
      nextStep: '验证邮箱',
      retryAfter: 60,
    })
    expect(b).toEqual({
      message: '无权访问',
      errorCode: 'EMAIL_NOT_VERIFIED',
      reason: '邮箱未验证',
      impact: '无法写操作',
      nextStep: '验证邮箱',
      explanation: undefined,
      retryAfter: 60,
    })
  })

  it('契约外字段（errors 字典）被忽略——validator 错误已 join 进 message', () => {
    const b = readErrorBody({ code: 400, message: 'a; b', data: null, timestamp: 'x', errors: { email: ['x'] } })
    expect(b.message).toBe('a; b')
    expect('errors' in b).toBe(false)
  })

  it('非对象 → 空（不抛）', () => {
    expect(readErrorBody(null)).toEqual({})
    expect(readErrorBody('oops')).toEqual({})
  })
})

describe('deniedByOf（W5-⑦ explanation）', () => {
  it('object 且含 deniedBy → 取值', () => {
    expect(deniedByOf({ deniedBy: 'casl' })).toBe('casl')
  })

  it('string explanation / undefined → undefined（不臆造）', () => {
    expect(deniedByOf('plain text')).toBeUndefined()
    expect(deniedByOf(undefined)).toBeUndefined()
  })
})
