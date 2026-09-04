// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiGovernancePolicy } from './ai-governance-policy.entity';
import { getPolicyPreset, getPolicyPresets, type PolicyPreset } from './governance-policy-presets';
import type { ToolRiskLevel } from '../interfaces/tool.interface';

/**
 * §22.15(4) 治理策略可视化编辑 — 门控档位（Gate Mode）：
 * 把「是否需确认」从布尔升级为三档——auto（自动执行）/ confirm（R3 本人即时确认）/
 * approval（R4 双人审批）。策略覆盖以 mode 写入，运行时 R4 审批判定改读策略档位。
 * R5（阻断）不可经政策放宽；legacy requiresConfirmation 布尔覆盖仍兼容解析。
 */
export type ToolGateMode = 'auto' | 'confirm' | 'approval';

/** 策略中的单工具覆盖（全部可选——前端 diff 保存：只写与默认不同的项） */
export interface ToolPolicyOverride {
  enabled?: boolean;
  /** legacy HS-9 布尔确认覆盖（§22.15(4) 起新保存改用 mode；本键保留以兼容解析旧数据/预设） */
  requiresConfirmation?: boolean;
  allowedRoles?: string[];
  /** 门控档位覆盖（优先级最高；R5 恒阻断，不可放宽） */
  mode?: ToolGateMode;
}

/** 合并默认后的生效工具策略（getToolPolicy / 便捷方法返回） */
export interface ToolPolicy {
  enabled: boolean;
  requiresConfirmation: boolean;
  /** R4 审批档（双人审批）：true 表示需审批人，而非本人即时确认 */
  requiresApproval: boolean;
  allowedRoles: string[];
  /** 生效门控档位：auto | confirm | approval */
  mode: ToolGateMode;
}

export interface GovernancePolicy {
  tools: Record<string, Partial<ToolPolicyOverride>>;
  audit: { granularity: 'all' | 'write' | 'off' };
  /** §22.16 A-5 授权链图：策略生效时间（无历史版本，取当前行 updatedAt；无策略行时 null） */
  updatedAt?: Date | null;
}

/**
 * §22.15(4) 生效门控档位（纯函数：策略服务与工具清单共用同一规则）：
 * 显式 mode 覆盖 > legacy requiresConfirmation 布尔 > 按声明风险级推导。
 *   R5 → blocked（恒阻断，政策不可放宽）
 *   R4 → approval / R3 → confirm / R0-R2 → auto
 *   legacy requiresConfirmation=false 视为降级到 auto（既有语义）；true 视为 confirm。
 */
export function effectiveGateMode(
  override: Partial<ToolPolicyOverride> | undefined,
  riskLevel: ToolRiskLevel,
): ToolGateMode | 'blocked' {
  if (riskLevel === 'R5') return 'blocked';
  const o = override ?? {};
  if (o.mode === 'auto' || o.mode === 'confirm' || o.mode === 'approval') return o.mode;
  if (o.requiresConfirmation === false) return 'auto';
  if (riskLevel === 'R4') return 'approval';
  if (o.requiresConfirmation === true || riskLevel === 'R3') return 'confirm';
  return 'auto';
}

/** 工具声明风险级对应的默认门控档位（策略编辑器显示「默认档」用）。 */
export function declaredGateMode(riskLevel: ToolRiskLevel): ToolGateMode | 'blocked' {
  return effectiveGateMode(undefined, riskLevel);
}

/**
 * HS-9 治理策略层：工具权限 / 确认规则 / 审计粒度从代码硬编码升级为数据驱动。
 * 策略存于自有表 ai_governance_policy（D2-1d，单行 id=1，value JSON）——从 Settings 迁出，
 * 治理台独立持有策略，不依赖业务 settings 表（独立治理库前提）。
 * 管理台可写实时生效（PUT /api/v1/ai/governance/policy），无需发版。
 *
 * 策略形状：
 * {
 *   "tools": {
 *     "create_event": { "enabled": false },
 *     "create_todo": { "requiresConfirmation": false },      // legacy 布尔（兼容）
 *     "create_customer": { "mode": "approval" },             // §22.15(4) 门控档位：auto|confirm|approval
 *     "web_search": { "allowedRoles": ["admin"] }
 *   },
 *   "audit": { "granularity": "all" | "write" | "off" }
 * }
 * 未配置的工具沿用工具定义默认值（含按声明风险级推导的门控档位）；未配置的维度沿用默认。
 */
@Injectable()
export class GovernancePolicyService {
  constructor(
    @InjectRepository(AiGovernancePolicy)
    private readonly policyRepo: Repository<AiGovernancePolicy>,
  ) {}

  async getPolicy(): Promise<GovernancePolicy> {
    const row = await this.policyRepo.findOne({ where: { id: 1 } });
    if (!row) return { tools: {}, audit: { granularity: 'all' }, updatedAt: null };
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>;
      const tools = (parsed?.tools ?? {}) as Record<string, Partial<ToolPolicyOverride>>;
      const granularity =
        (parsed?.audit as { granularity?: string } | undefined)?.granularity ?? 'all';
      return {
        tools,
        audit: { granularity: granularity === 'write' || granularity === 'off' ? granularity : 'all' },
        updatedAt: row.updatedAt ?? null,
      };
    } catch {
      return { tools: {}, audit: { granularity: 'all' }, updatedAt: row.updatedAt ?? null };
    }
  }

  /** 写策略（upsert 单行 id=1），管理台策略中心调用，实时生效。 */
  async setPolicy(value: GovernancePolicy): Promise<GovernancePolicy> {
    const normalized: GovernancePolicy = {
      tools: value.tools ?? {},
      audit: { granularity: value.audit?.granularity ?? 'all' },
    };
    await this.policyRepo.save({ id: 1, value: JSON.stringify(normalized) });
    return normalized;
  }

  /** 工具策略：默认值来自工具定义/调用方，策略表同名键覆盖；含门控档位（mode）解析。 */
  async getToolPolicy(
    name: string,
    defaults: { enabled?: boolean; requiresConfirmation?: boolean } = {},
  ): Promise<ToolPolicy> {
    const policy = await this.getPolicy();
    const override = policy.tools?.[name] ?? {};
    let mode: ToolGateMode;
    if (override.mode === 'auto' || override.mode === 'confirm' || override.mode === 'approval') {
      mode = override.mode;
    } else if (override.requiresConfirmation !== undefined) {
      mode = override.requiresConfirmation ? 'confirm' : 'auto';
    } else {
      mode = defaults.requiresConfirmation ? 'confirm' : 'auto';
    }
    return {
      enabled: override.enabled ?? defaults.enabled ?? true,
      requiresConfirmation: mode !== 'auto',
      requiresApproval: mode === 'approval',
      allowedRoles: override.allowedRoles ?? [],
      mode,
    };
  }

  async isToolEnabled(name: string, defaultEnabled = true): Promise<boolean> {
    return (await this.getToolPolicy(name, { enabled: defaultEnabled })).enabled;
  }

  async requiresConfirmation(name: string, defaultRequires: boolean): Promise<boolean> {
    return (
      await this.getToolPolicy(name, { requiresConfirmation: defaultRequires })
    ).requiresConfirmation;
  }

  async getAllowedRoles(name: string): Promise<string[]> {
    return (await this.getToolPolicy(name)).allowedRoles;
  }

  /**
   * §22.15(4) 生效门控档位：策略覆盖（mode > legacy requiresConfirmation）> 声明风险级推导。
   * R5 恒返回 'blocked'——不可经政策放宽（R5 阻断在工具门控层先于确认执行）。
   */
  async resolveGateMode(
    name: string,
    riskLevel: ToolRiskLevel,
  ): Promise<ToolGateMode | 'blocked'> {
    const policy = await this.getPolicy();
    return effectiveGateMode(policy.tools?.[name], riskLevel);
  }

  /** §22.15(4) R4 审批档判定：策略把工具升档/设为 approval，或声明风险级即 R4。 */
  async requiresApproval(name: string, riskLevel: ToolRiskLevel): Promise<boolean> {
    return (await this.resolveGateMode(name, riskLevel)) === 'approval';
  }

  async getAuditGranularity(): Promise<'all' | 'write' | 'off'> {
    return (await this.getPolicy()).audit.granularity;
  }

  /** §22.15 策略模板库：返回三档预设（金融/政务/通用），供管理台一键导入。 */
  getPresets(): PolicyPreset[] {
    return getPolicyPresets();
  }

  /** §22.15 策略模板库：一键应用预设（写 ai_governance_policy 实时生效）。 */
  async applyPreset(id: string): Promise<GovernancePolicy> {
    const preset = getPolicyPreset(id);
    if (!preset) throw new NotFoundException(`策略预设不存在: ${id}`);
    return this.setPolicy(preset.policy);
  }
}
