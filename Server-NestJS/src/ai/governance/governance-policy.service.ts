import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiGovernancePolicy } from './ai-governance-policy.entity';
import { getPolicyPreset, getPolicyPresets, type PolicyPreset } from './governance-policy-presets';

export interface ToolPolicy {
  enabled: boolean;
  requiresConfirmation: boolean;
  allowedRoles: string[];
}

export interface GovernancePolicy {
  tools: Record<string, Partial<ToolPolicy>>;
  audit: { granularity: 'all' | 'write' | 'off' };
  /** §22.16 A-5 授权链图：策略生效时间（无历史版本，取当前行 updatedAt；无策略行时 null） */
  updatedAt?: Date | null;
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
 *     "create_todo": { "requiresConfirmation": false },
 *     "web_search": { "allowedRoles": ["admin"] }
 *   },
 *   "audit": { "granularity": "all" | "write" | "off" }
 * }
 * 未配置的工具沿用工具定义默认值；未配置的维度沿用默认。
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
      const tools = (parsed?.tools ?? {}) as Record<string, Partial<ToolPolicy>>;
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

  /** 工具策略：默认值来自工具定义，策略表同名键覆盖。 */
  async getToolPolicy(
    name: string,
    defaults: { enabled?: boolean; requiresConfirmation?: boolean } = {},
  ): Promise<ToolPolicy> {
    const policy = await this.getPolicy();
    const override = policy.tools?.[name] ?? {};
    return {
      enabled: override.enabled ?? defaults.enabled ?? true,
      requiresConfirmation:
        override.requiresConfirmation ?? defaults.requiresConfirmation ?? false,
      allowedRoles: override.allowedRoles ?? [],
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
