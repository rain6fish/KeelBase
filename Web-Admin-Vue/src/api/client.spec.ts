// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { ApiError, isEmailNotVerified } from './client'

describe('ApiError', () => {
  it('构造时保存状态码与业务码', () => {
    const err = new ApiError('邮箱未验证', 403, 'EMAIL_NOT_VERIFIED', { email: ['invalid'] })
    expect(err.statusCode).toBe(403)
    expect(err.errorCode).toBe('EMAIL_NOT_VERIFIED')
    expect(err.errors?.email).toEqual(['invalid'])
    expect(err.message).toBe('邮箱未验证')
  })

  it('缺省参数默认值', () => {
    const err = new ApiError('出错了', 500)
    expect(err.errorCode).toBeUndefined()
    expect(err.errors).toBeUndefined()
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
