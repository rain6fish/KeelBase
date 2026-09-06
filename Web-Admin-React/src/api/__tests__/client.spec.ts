// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { ApiError, isEmailNotVerified } from '@/api/client'

describe('ApiError', () => {
  it('carries message, statusCode, errorCode and field errors', () => {
    const err = new ApiError('boom', 422, 'VALIDATION', { email: ['required'] })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
    expect(err.statusCode).toBe(422)
    expect(err.errorCode).toBe('VALIDATION')
    expect(err.errors?.email).toEqual(['required'])
  })

  it('defaults optional metadata to undefined', () => {
    const err = new ApiError('boom', 500)
    expect(err.statusCode).toBe(500)
    expect(err.errorCode).toBeUndefined()
    expect(err.errors).toBeUndefined()
  })
})

describe('isEmailNotVerified', () => {
  it('is true only for an ApiError carrying the EMAIL_NOT_VERIFIED code', () => {
    expect(isEmailNotVerified(new ApiError('verify your email', 403, 'EMAIL_NOT_VERIFIED'))).toBe(true)
    expect(isEmailNotVerified(new ApiError('forbidden', 403, 'FORBIDDEN'))).toBe(false)
  })

  it('is false for plain errors and non-errors', () => {
    expect(isEmailNotVerified(new Error('boom'))).toBe(false)
    expect(isEmailNotVerified('boom')).toBe(false)
    expect(isEmailNotVerified(null)).toBe(false)
    expect(isEmailNotVerified(undefined)).toBe(false)
  })
})
