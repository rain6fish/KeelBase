// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
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
  /** §22.17③ Policy Evidence：策略内容指纹，同内容恒同号、任何变更必变号（做「版本」用，无需迁移/历史表） */
  revision?: string;
}

/** 规范化策略（排序 key、剔除非法维度）→ 保证「同内容 → 同指纹」。 */
function normalizePolicy(value: Partial<GovernancePolicy> | null | undefined): GovernancePolicy {
  const tools: Record<string, Partial<ToolPolicy>> = {};
  for (const [name, cfg] of Object.entries(value?.tools ?? {})) {
    if (!cfg || typeof cfg !== 'object') continue;
    const entry: Partial<ToolPolicy> = {};
    if (typeof cfg.enabled === 'boolean') entry.enabled = cfg.enabled;
    if (typeof cfg.requiresConfirmation === 'boolean') entry.requiresConfirmation = cfg.requiresConfirmation;
    if (Array.isArray(cfg.allowedRoles)) entry.allowedRoles = [...cfg.allowedRoles].sort();
    if (Object.keys(entry).length > 0) tools[name] = entry;
  }
  const sortedTools: Record<string, Partial<ToolPolicy>> = {};
  for (const name of Object.keys(tools).sort()) sortedTools[name] = tools[name];
  const granularity = value?.audit?.granularity;
  return {
    tools: sortedTools,
    audit: { granularity: granularity === 'write' || granularity === 'off' ? granularity : 'all' },
  };
}

function parsePolicyValue(raw: string): GovernancePolicy {
  try {
    return normalizePolicy(JSON.parse(raw) as Partial<GovernancePolicy>);
  } catch {
    return normalizePolicy({});
  }
}

/** §22.17③ 策略内容指纹：sha256(规范化 JSON) 前 12 hex。null/坏串 → 空策略指纹。 */
export function policyRevisionOf(value: Partial<GovernancePolicy> | string | null | undefined): string {
  const policy = typeof value === 'string' ? parsePolicyValue(value) : normalizePolicy(value);
  return createHash('sha256').update(JSON.stringify(policy)).digest('hex').slice(0, 12);
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
    if (!row) return { ...normalizePolicy({}), updatedAt: null, revision: policyRevisionOf(undefined) };
    return {
      ...parsePolicyValue(row.value),
      updatedAt: row.updatedAt ?? null,
      revision: policyRevisionOf(row.value),
    };
  }

  /** 写策略（upsert 单行 id=1），管理台策略中心调用，实时生效。 */
  async setPolicy(value: GovernancePolicy): Promise<GovernancePolicy> {
    const normalized = normalizePolicy(value);
    const entity = await this.policyRepo.save({ id: 1, value: JSON.stringify(normalized) });
    return {
      ...normalized,
      updatedAt: entity.updatedAt ?? null,
      revision: policyRevisionOf(entity.value),
    };
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

  /**
   * §22.17③ 决策可复现（Policy Evidence）：用当前策略重放一条审计记录的授权放行，
   * 判断「当时为什么允许」是否仍成立。recorded 来自审计 authorization 快照 JSON 解析。
   * 可复现 = 策略内容指纹未漂移；或已漂移但该工具「放行/禁用」判定未受影响。
   */
  async verifyReproducible(recorded: {
    tool?: string;
    checks?: Array<{ name: string; ok?: boolean }>;
    policyRevision?: string;
  }): Promise<{
    verifiable: boolean;
    reproducible: boolean;
    policyChanged: boolean;
    toolDecisionChanged: boolean;
    recordedRevision: string | null;
    currentRevision: string;
    note: string;
  }> {
    if (!recorded?.policyRevision) {
      return {
        verifiable: false,
        reproducible: false,
        policyChanged: false,
        toolDecisionChanged: false,
        recordedRevision: null,
        currentRevision: policyRevisionOf(undefined),
        note: '快照无策略版本（历史记录），无法校验',
      };
    }
    const current = await this.getPolicy();
    const currentRevision = current.revision ?? policyRevisionOf(undefined);
    const policyChanged = recorded.policyRevision !== currentRevision;
    let toolDecisionChanged = false;
    if (recorded.tool) {
      const recordedEnabled = recorded.checks?.find((c) => c.name === 'tool_enabled')?.ok;
      const currentTool = await this.getToolPolicy(recorded.tool);
      if (typeof recordedEnabled === 'boolean' && recordedEnabled !== currentTool.enabled) {
        toolDecisionChanged = true;
      }
    }
    const reproducible = !toolDecisionChanged;
    const note = policyChanged
      ? toolDecisionChanged
        ? `策略已漂移（${recorded.policyRevision} → ${currentRevision}）且该工具放行判定已变，不可复现`
        : `策略已漂移（${recorded.policyRevision} → ${currentRevision}），但该工具放行判定未受影响，仍可复现`
      : '策略未变，该放行按记录版本可复现';
    return {
      verifiable: true,
      reproducible,
      policyChanged,
      toolDecisionChanged,
      recordedRevision: recorded.policyRevision,
      currentRevision,
      note,
    };
  }
}
