// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { formatBytes, formatTime, formatUptime } from '@/utils/format'

describe('formatTime', () => {
  it('renders empty input as -', () => {
    expect(formatTime()).toBe('-')
    expect(formatTime(null)).toBe('-')
    expect(formatTime('')).toBe('-')
  })

  it('renders an invalid date string as -', () => {
    expect(formatTime('not-a-date')).toBe('-')
  })

  it('formats local YYYY-MM-DD HH:mm with zero padding', () => {
    expect(formatTime(new Date(2026, 8, 6, 9, 5))).toBe('2026-09-06 09:05')
    expect(formatTime(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02 23:59')
  })

  it('parses an ISO string to the same local rendering as the Date it encodes', () => {
    const d = new Date(2026, 3, 15, 8, 30)
    expect(formatTime(d.toISOString())).toBe(formatTime(d))
  })
})

describe('formatBytes', () => {
  it('renders empty/non-number input as -', () => {
    expect(formatBytes()).toBe('-')
    expect(formatBytes(null)).toBe('-')
    expect(formatBytes(Number.NaN)).toBe('-')
  })

  it('stays in bytes below 1024', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('scales up with one decimal below 10 and none above', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(15360)).toBe('15 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1610612736)).toBe('1.5 GB')
    expect(formatBytes(2748779069440)).toBe('2.5 TB')
  })
})

describe('formatUptime', () => {
  it('renders empty input as -', () => {
    expect(formatUptime()).toBe('-')
    expect(formatUptime(null)).toBe('-')
    expect(formatUptime(Number.NaN)).toBe('-')
  })

  it('renders seconds alone under a minute', () => {
    expect(formatUptime(0)).toBe('0s')
    expect(formatUptime(59)).toBe('59s')
  })

  it('adds minutes once a minute has elapsed', () => {
    expect(formatUptime(60)).toBe('1m 0s')
    expect(formatUptime(125)).toBe('2m 5s')
  })

  it('adds hours and pads minutes/seconds once an hour has elapsed', () => {
    expect(formatUptime(3600)).toBe('1h 0m 0s')
    expect(formatUptime(3725)).toBe('1h 2m 5s')
  })
})
