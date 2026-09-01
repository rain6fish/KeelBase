// SPDX-License-Identifier: Apache-2.0

export type AuditGranularity = 'all' | 'write' | 'off'

export interface PolicyToolOverride {
  enabled?: boolean
  requiresConfirmation?: boolean
  allowedRoles?: string[]
}

export interface GovernancePolicyShape {
  tools: Record<string, PolicyToolOverride>
  audit: { granularity: AuditGranularity }
}

export interface PolicyToolState {
  name: string
  description?: string
  enabled: boolean
  requiresConfirmation: boolean
  allowedRoles: string[]
}

/** 解析 Settings 中存储的治理策略 JSON（容忍缺省/非法，回退空策略）。与后端 GovernancePolicyService.getPolicy 语义对齐。 */
export function parseGovernancePolicy(raw?: string | null): GovernancePolicyShape {
  if (!raw) return { tools: {}, audit: { granularity: 'all' } }
  try {
    const parsed = JSON.parse(raw) as {
      tools?: Record<string, PolicyToolOverride>
      audit?: { granularity?: string }
    }
    const g = parsed.audit?.granularity
    return {
      tools: parsed.tools ?? {},
      audit: { granularity: g === 'write' || g === 'off' ? g : 'all' },
    }
  } catch {
    return { tools: {}, audit: { granularity: 'all' } }
  }
}

/** 把每个工具当前生效状态规范化为显式完整策略（每个工具都写覆盖，管理台所见即所得）。 */
export function buildGovernancePolicy(
  tools: PolicyToolState[],
  granularity: AuditGranularity,
): GovernancePolicyShape {
  const toolsMap: Record<string, PolicyToolOverride> = {}
  for (const t of tools) {
    toolsMap[t.name] = {
      enabled: t.enabled,
      requiresConfirmation: t.requiresConfirmation,
      allowedRoles: t.allowedRoles,
    }
  }
  return { tools: toolsMap, audit: { granularity } }
}
