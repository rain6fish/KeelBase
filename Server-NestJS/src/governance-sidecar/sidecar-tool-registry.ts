// SPDX-License-Identifier: Apache-2.0

/**
 * 治理 sidecar 工具注册表 + 门控决策（S-2，对齐 ai-governance-protocol.md §4 风险分级）。
 *
 * 纯逻辑、无 IO，便于单测：
 * - 工具风险级来源：SIDECAR_TOOLS（业务系统工具清单，name → riskLevel）
 * - 策略覆盖来源：治理台 GET /external/governance/policy（enabled / requiresConfirmation 覆盖）
 * - 决策：R5 阻断 / R3-R4 确认 / R0-R2 自动；策略可强制确认或禁用
 */

export interface SidecarToolDef {
  name: string;
  /** R0-R5（对齐协议 §4.1） */
  riskLevel: string;
}

export interface ToolOverride {
  enabled?: boolean;
  requiresConfirmation?: boolean;
}

export type ToolDecision =
  | { decision: 'auto'; risk: string }
  | { decision: 'confirm'; risk: string; reason: string }
  | { decision: 'block'; risk: string; reason: string };

export class SidecarToolRegistry {
  private readonly tools = new Map<string, SidecarToolDef>();
  private overrides = new Map<string, ToolOverride>();
  private readonly defaultRisk: string;

  constructor(defs: SidecarToolDef[] = [], defaultRisk = 'R1') {
    this.defaultRisk = defaultRisk;
    for (const d of defs) this.tools.set(d.name, d);
  }

  /** 工具名清单（诊断/审计用） */
  names(): string[] {
    return [...this.tools.keys()];
  }

  riskOf(name: string): string {
    return this.tools.get(name)?.riskLevel ?? this.defaultRisk;
  }

  /** 应用治理台策略覆盖（enabled / requiresConfirmation）。 */
  setPolicy(policy: { tools?: Record<string, ToolOverride> } | undefined | null): void {
    this.overrides = new Map(Object.entries(policy?.tools ?? {}));
  }

  /**
   * 门控决策（协议 §4.3 治理管线在 sidecar 的落点）：
   *   R5 → block（不可逆/外部动作，直接阻断）
   *   策略 enabled=false → block
   *   R3/R4 或策略 requiresConfirmation=true → confirm
   *   其余（R0-R2）→ auto
   */
  decide(name: string): ToolDecision {
    const override = this.overrides.get(name);
    if (override?.enabled === false) {
      return { decision: 'block', risk: this.riskOf(name), reason: 'governance policy disabled' };
    }
    const risk = this.riskOf(name);
    if (risk === 'R5') {
      return { decision: 'block', risk, reason: 'R5 irreversible/external action' };
    }
    if (override?.requiresConfirmation === true) {
      return { decision: 'confirm', risk, reason: 'governance policy requires confirmation' };
    }
    if (risk === 'R3' || risk === 'R4') {
      return { decision: 'confirm', risk, reason: `${risk} business-sensitive/high-impact write` };
    }
    return { decision: 'auto', risk };
  }
}
