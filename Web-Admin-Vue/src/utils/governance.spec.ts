import { describe, expect, it } from 'vitest'
import { buildGovernancePolicy, parseGovernancePolicy } from './governance'

describe('parseGovernancePolicy', () => {
  it('空值回退空策略 + 审计粒度 all', () => {
    expect(parseGovernancePolicy(undefined)).toEqual({ tools: {}, audit: { granularity: 'all' } })
    expect(parseGovernancePolicy(null)).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })

  it('解析合法 JSON（工具覆盖 + 粒度）', () => {
    const raw = JSON.stringify({
      tools: { create_event: { enabled: false }, web_search: { allowedRoles: ['admin'] } },
      audit: { granularity: 'write' },
    })
    expect(parseGovernancePolicy(raw)).toEqual({
      tools: {
        create_event: { enabled: false },
        web_search: { allowedRoles: ['admin'] },
      },
      audit: { granularity: 'write' },
    })
  })

  it('缺 audit 或粒度非法时回退 all', () => {
    expect(parseGovernancePolicy(JSON.stringify({ tools: {} }))).toEqual({
      tools: {},
      audit: { granularity: 'all' },
    })
    expect(parseGovernancePolicy(JSON.stringify({ audit: { granularity: 'bogus' } }))).toEqual({
      tools: {},
      audit: { granularity: 'all' },
    })
  })

  it('非法 JSON 回退空策略', () => {
    expect(parseGovernancePolicy('not-json{')).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })
})

describe('buildGovernancePolicy', () => {
  it('为每个工具写出显式三维覆盖', () => {
    const policy = buildGovernancePolicy(
      [
        { name: 'create_event', enabled: false, requiresConfirmation: true, allowedRoles: ['admin'] },
        { name: 'query_events', enabled: true, requiresConfirmation: false, allowedRoles: [] },
      ],
      'off',
    )
    expect(policy).toEqual({
      tools: {
        create_event: { enabled: false, requiresConfirmation: true, allowedRoles: ['admin'] },
        query_events: { enabled: true, requiresConfirmation: false, allowedRoles: [] },
      },
      audit: { granularity: 'off' },
    })
  })

  it('空工具列表时仅保留审计粒度', () => {
    expect(buildGovernancePolicy([], 'all')).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })
})
