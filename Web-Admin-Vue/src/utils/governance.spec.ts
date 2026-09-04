// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  buildGovernancePolicy,
  declaredGateMode,
  effectiveGate,
  parseGovernancePolicy,
} from './governance'
import type { PolicyToolState } from './governance'

describe('parseGovernancePolicy', () => {
  it('空值回退空策略 + 审计粒度 all', () => {
    expect(parseGovernancePolicy(undefined)).toEqual({ tools: {}, audit: { granularity: 'all' } })
    expect(parseGovernancePolicy(null)).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })

  it('解析合法 JSON（工具覆盖 + 粒度，含 mode 档位）', () => {
    const raw = JSON.stringify({
      tools: {
        create_event: { enabled: false },
        create_customer: { mode: 'approval' },
        web_search: { allowedRoles: ['admin'] },
      },
      audit: { granularity: 'write' },
    })
    expect(parseGovernancePolicy(raw)).toEqual({
      tools: {
        create_event: { enabled: false },
        create_customer: { mode: 'approval' },
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

describe('declaredGateMode / effectiveGate（§22.15(4) 档位默认）', () => {
  it('声明风险级推导默认档：R5→blocked / R4→approval / R3→confirm / R0-R2→auto', () => {
    expect(declaredGateMode('R5')).toBe('blocked')
    expect(declaredGateMode('R4')).toBe('approval')
    expect(declaredGateMode('R3')).toBe('confirm')
    expect(declaredGateMode('R2')).toBe('auto')
    expect(declaredGateMode('R1')).toBe('auto')
    expect(declaredGateMode(undefined)).toBe('auto')
  })

  it('生效档优先后端 gateMode；缺省由 requiresApproval/requiresConfirmation 推导', () => {
    expect(effectiveGate({ requiresConfirmation: true, gateMode: 'approval', riskLevel: 'R3' })).toBe('approval')
    expect(effectiveGate({ requiresApproval: true, requiresConfirmation: true, riskLevel: 'R3' })).toBe('approval')
    expect(effectiveGate({ requiresConfirmation: true, riskLevel: 'R2' })).toBe('confirm')
    expect(effectiveGate({ requiresConfirmation: false, riskLevel: 'R3' })).toBe('confirm')
  })
})

describe('buildGovernancePolicy（§22.15(4) 差异保存）', () => {
  const row = (over: Partial<PolicyToolState>): PolicyToolState => ({
    name: 'create_event',
    riskLevel: 'R3',
    enabled: true,
    allowedRoles: [],
    gate: 'confirm',
    declaredGate: 'confirm',
    ...over,
  })

  it('与默认一致的工具不写覆盖（仅审计粒度）', () => {
    expect(
      buildGovernancePolicy(
        [
          row({ name: 'create_event' }),
          { name: 'query_events', riskLevel: 'R1', enabled: true, allowedRoles: [], gate: 'auto', declaredGate: 'auto' },
        ],
        'all',
      ),
    ).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })

  it('R3 工具升档 approval → 写 mode=approval（R4 审批档）', () => {
    expect(buildGovernancePolicy([row({ name: 'create_customer', gate: 'approval' })], 'all')).toEqual({
      tools: { create_customer: { mode: 'approval' } },
      audit: { granularity: 'all' },
    })
  })

  it('R3 工具放宽 auto → 写 mode=auto', () => {
    expect(buildGovernancePolicy([row({ name: 'create_event', gate: 'auto' })], 'all')).toEqual({
      tools: { create_event: { mode: 'auto' } },
      audit: { granularity: 'all' },
    })
  })

  it('禁用工具 → enabled:false；角色非空 → allowedRoles', () => {
    expect(
      buildGovernancePolicy(
        [row({ name: 'create_event', enabled: false, allowedRoles: ['admin'] })],
        'off',
      ),
    ).toEqual({
      tools: { create_event: { enabled: false, allowedRoles: ['admin'] } },
      audit: { granularity: 'off' },
    })
  })

  it('R5 恒阻断行整行忽略（blocked 不可配置）', () => {
    expect(
      buildGovernancePolicy(
        [{ name: 'delete_customer', riskLevel: 'R5', enabled: false, allowedRoles: ['admin'], gate: 'blocked', declaredGate: 'blocked' }],
        'all',
      ),
    ).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })

  it('空工具列表时仅保留审计粒度', () => {
    expect(buildGovernancePolicy([], 'all')).toEqual({ tools: {}, audit: { granularity: 'all' } })
  })
})
