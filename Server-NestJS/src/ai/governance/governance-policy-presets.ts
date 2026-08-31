import type { GovernancePolicy } from './governance-policy.service';

/**
 * §22.15 治理策略模板库（三性·应用性）：金融 / 政务 / 通用三档预设策略，一键导入实时生效。
 * 联动信创三卡「开箱合规」——金融/政务档适配等保/密评对审计粒度与写确认的默认要求。
 * 预设为「策略覆盖」（audit granularity + 关键写工具确认/角色），未覆盖的工具沿用工具定义默认。
 */

/** 常见业务写工具（旗舰 + 生成模块）——预设对它们统一设确认要求 */
const COMMON_WRITE_TOOLS = [
  'create_event',
  'create_todo',
  'create_followup_task',
  'create_project_task',
  'submit_approval_request',
  'create_customer',
  'update_customer',
  'delete_customer',
  'create_contract',
  'update_contract',
  'create_supplier',
  'update_supplier',
  'create_tag',
  'update_tag',
  'create_note',
  'update_note',
];

export interface PolicyPreset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  policy: GovernancePolicy;
}

export const POLICY_PRESETS: Record<string, PolicyPreset> = {
  finance: {
    id: 'finance',
    labelKey: 'presetFinance',
    descriptionKey: 'presetFinanceDesc',
    policy: {
      audit: { granularity: 'all' },
      tools: Object.fromEntries(
        COMMON_WRITE_TOOLS.map((t) => [t, { requiresConfirmation: true }]),
      ),
    },
  },
  government: {
    id: 'government',
    labelKey: 'presetGovernment',
    descriptionKey: 'presetGovernmentDesc',
    policy: {
      audit: { granularity: 'write' },
      tools: Object.fromEntries(
        [
          'create_event',
          'create_todo',
          'create_followup_task',
          'create_project_task',
          'submit_approval_request',
          'create_customer',
          'update_customer',
        ].map((t) => [t, { requiresConfirmation: true }]),
      ),
    },
  },
  general: {
    id: 'general',
    labelKey: 'presetGeneral',
    descriptionKey: 'presetGeneralDesc',
    policy: {
      audit: { granularity: 'all' },
      tools: {},
    },
  },
};

export function getPolicyPresets(): PolicyPreset[] {
  return Object.values(POLICY_PRESETS);
}

export function getPolicyPreset(id: string): PolicyPreset | undefined {
  return POLICY_PRESETS[id];
}
