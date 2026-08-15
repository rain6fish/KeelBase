import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

export interface ToolPolicy {
  enabled: boolean;
  requiresConfirmation: boolean;
  allowedRoles: string[];
}

export interface GovernancePolicy {
  tools: Record<string, Partial<ToolPolicy>>;
  audit: { granularity: 'all' | 'write' | 'off' };
}

/**
 * HS-9 治理策略层：工具权限 / 确认规则 / 审计粒度从代码硬编码升级为数据驱动。
 * 策略存于 Settings（RG-2 动态配置，key = ai_governance_policy，JSON 字符串），
 * 管理台可写 PUT /settings/:key 实时生效，无需发版。
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
  static readonly SETTING_KEY = 'ai_governance_policy';

  constructor(private readonly settingsService: SettingsService) {}

  async getPolicy(): Promise<GovernancePolicy> {
    const raw = await this.settingsService.get(GovernancePolicyService.SETTING_KEY);
    if (!raw) return { tools: {}, audit: { granularity: 'all' } };
    try {
      const parsed =
        typeof raw === 'string'
          ? (JSON.parse(raw) as Record<string, unknown>)
          : (raw as Record<string, unknown>);
      const tools = (parsed?.tools ?? {}) as Record<string, Partial<ToolPolicy>>;
      const granularity =
        (parsed?.audit as { granularity?: string } | undefined)?.granularity ?? 'all';
      return {
        tools,
        audit: { granularity: granularity === 'write' || granularity === 'off' ? granularity : 'all' },
      };
    } catch {
      return { tools: {}, audit: { granularity: 'all' } };
    }
  }

  /** 工具策略：默认值来自工具定义，Settings 同名键覆盖。 */
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
}
