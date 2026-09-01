// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { traceSource, traceSourceKey, traceSourceTagType } from '../traceSource'

describe('traceSource（D1 Human-Agent-System 步骤来源分类）', () => {
  it('input/confirmation → human（人的操作）', () => {
    expect(traceSource('input')).toBe('human')
    expect(traceSource('confirmation')).toBe('human')
  })

  it('assistant/tool_call → agent（AI 执行）', () => {
    expect(traceSource('assistant')).toBe('agent')
    expect(traceSource('tool_call')).toBe('agent')
  })

  it('effect/notice/未知类型 → system（系统）', () => {
    expect(traceSource('effect')).toBe('system')
    expect(traceSource('notice')).toBe('system')
    expect(traceSource('unknown')).toBe('system')
  })

  it('来源 → i18n key / tag 类型映射', () => {
    expect(traceSourceKey('human')).toBe('traceSourceHuman')
    expect(traceSourceKey('agent')).toBe('traceSourceAgent')
    expect(traceSourceKey('system')).toBe('traceSourceSystem')
    expect(traceSourceTagType('human')).toBe('success')
    expect(traceSourceTagType('agent')).toBe('primary')
    expect(traceSourceTagType('system')).toBe('info')
  })
})
