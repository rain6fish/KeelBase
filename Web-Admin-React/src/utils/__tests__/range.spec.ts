// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RANGE_OPTIONS, sinceForOption, type RangeOption } from '@/utils/range'

const NOW = new Date('2026-09-06T15:30:00.000Z')

function option(key: string): RangeOption {
  const o = RANGE_OPTIONS.find((x) => x.key === key)
  if (!o) throw new Error(`RANGE_OPTIONS missing ${key}`)
  return o
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RANGE_OPTIONS', () => {
  it('exposes the documented ranges in order with their day offsets', () => {
    expect(RANGE_OPTIONS.map((o) => o.key)).toEqual(['all', 'today', '7d', '30d'])
    expect(RANGE_OPTIONS.map((o) => o.days)).toEqual([null, 0, 7, 30])
  })
})

describe('sinceForOption', () => {
  it('returns undefined for the all range (no since bound)', () => {
    expect(sinceForOption(option('all'))).toBeUndefined()
  })

  it('today bounds to the local start of the current day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const expected = new Date(NOW)
    expected.setHours(0, 0, 0, 0)
    const since = sinceForOption(option('today'))
    expect(typeof since).toBe('string')
    expect(new Date(since as string).getTime()).toBe(expected.getTime())
  })

  it.each([
    ['7d', 7],
    ['30d', 30],
  ])('%s subtracts %i calendar days keeping the clock time', (key, days) => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const expected = new Date(NOW)
    expected.setDate(expected.getDate() - days)
    const since = sinceForOption(option(key))
    expect(typeof since).toBe('string')
    expect(new Date(since as string).getTime()).toBe(expected.getTime())
  })
})
