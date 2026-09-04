// SPDX-License-Identifier: Apache-2.0

export type AuditGranularity = 'all' | 'write' | 'off'

/** §22.15(4) 门控档位：auto 自动执行 / confirm R3 本人即时确认 / approval R4 双人审批 */
export type ToolGateMode = 'auto' | 'confirm' | 'approval'
/** 生效/声明档位（含 R5 恒阻断） */
export type ResolvedGateMode = ToolGateMode | 'blocked'

export interface PolicyToolOverride {
  enabled?: boolean
  /** legacy HS-9 布尔确认覆盖（新保存写 mode；本键仅解析旧数据/预设） */
  requiresConfirmation?: boolean
  allowedRoles?: string[]
  /** §22.15(4) 门控档位覆盖（R5 恒阻断不可配置） */
  mode?: ToolGateMode
}

export interface GovernancePolicyShape {
  tools: Record<string, PolicyToolOverride>
  audit: { granularity: AuditGranularity }
}

export interface PolicyToolState {
  name: string
  description?: string
  /** 工具声明风险级（R0-R5） */
  riskLevel: string
  enabled: boolean
  allowedRoles: string[]
  /** 生效门控档位（策略覆盖后的当前档；R5 → 'blocked'） */
  gate: ResolvedGateMode
  /** 声明档位（工具风险级推导的默认档） */
  declaredGate: ResolvedGateMode
  /** 当前策略中已存在该工具的覆盖（加载时置位，用于「已覆盖」标记） */
  overridden?: boolean
}

/** W5 风险级默认门控档位（与后端 declaredGateMode 对齐）：R5→blocked / R4→approval / R3→confirm / 其余 auto。 */
export function declaredGateMode(riskLevel?: string): ResolvedGateMode {
  if (riskLevel === 'R5') return 'blocked'
  if (riskLevel === 'R4') return 'approval'
  if (riskLevel === 'R3') return 'confirm'
  return 'auto'
}

/** 清单行 → 生效门控档位：优先后端 gateMode；无则按 requiresApproval/requiresConfirmation/声明推导。 */
export function effectiveGate(tool: {
  requiresApproval?: boolean
  requiresConfirmation: boolean
  gateMode?: ResolvedGateMode
  riskLevel?: string
}): ResolvedGateMode {
  if (tool.gateMode) return tool.gateMode
  const declared = declaredGateMode(tool.riskLevel)
  if (tool.requiresApproval) return 'approval'
  if (tool.requiresConfirmation) return 'confirm'
  return declared
}

/** 解析 Settings/治理表中存储的治理策略 JSON（容忍缺省/非法，回退空策略）。与后端 GovernancePolicyService.getPolicy 语义对齐。 */
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

/**
 * 差异保存（§22.15(4)）：只写入与工具默认不同的覆盖项——
 * enabled=false / 生效档位≠声明档位 / allowedRoles 非空；R5（blocked）整行忽略。
 * 未列出的工具 = 沿用工具声明（未来默认升级可自动传播，不再被写死的全量覆盖卡住）。
 */
export function buildGovernancePolicy(
  tools: PolicyToolState[],
  granularity: AuditGranularity,
): GovernancePolicyShape {
  const toolsMap: Record<string, PolicyToolOverride> = {}
  for (const t of tools) {
    if (t.gate === 'blocked') continue
    const override: PolicyToolOverride = {}
    if (t.enabled === false) override.enabled = false
    if (t.gate !== t.declaredGate) override.mode = t.gate
    if (t.allowedRoles.length > 0) override.allowedRoles = [...t.allowedRoles]
    if (Object.keys(override).length > 0) toolsMap[t.name] = override
  }
  return { tools: toolsMap, audit: { granularity } }
}
