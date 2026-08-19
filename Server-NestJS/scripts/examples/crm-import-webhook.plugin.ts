/**
 * 示例第三方插件 crm-import-webhook（企业集成：CRM 客户导入标准化）。
 *
 * 演示插件机制三个能力：
 * - registerRoute：注册 /plugins/crm-import-webhook/normalize HTTP 端点（只读）
 * - getService：按名称访问宿主 CrmService（AI CRM 旗舰）
 * - isFeatureEnabled：读取 crm 特性开关
 *
 * 本文件是自包含源码（第三方作者化模式，不看 Core 内部实现）：
 * - 不 import 宿主相对路径（无 `../plugin.interface` 等），`keelbase-plugin add` 直接复制进宿主编译；
 * - 本地声明与宿主一致的 PluginManifest/PluginContext 形状（结构校验），运行时无宿主类型依赖；
 * - 业务逻辑为纯函数 + 宿主服务探测，无外部 API/凭据，可本地验证。
 */

/** 与宿主 `src/plugins/plugin.interface.ts` 一致的清单形状（结构校验，非宿主 import）。 */
interface PluginManifest {
  name: string;
  version: string;
  description: string;
  requires?: string[];
  featureFlag?: string;
  capabilities?: string[];
  hooks?: {
    onAppStart?: (ctx: PluginContext) => Promise<void> | void;
  };
}

/** 与宿主 PluginContext 一致的注入形状。 */
interface PluginContext {
  getService<T = unknown>(name: string): T | null;
  isFeatureEnabled(key: string): boolean;
  registerRoute(path: string, handler: (req: unknown) => Promise<unknown> | unknown): void;
}

/** 企业集成：客户线索导入标准化（纯函数，无 IO）。 */
function normalizeLead(raw: unknown): {
  name: string;
  email: string | null;
  company: string;
  amount: number;
  valueTier: string;
  warnings: string[];
} {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const warnings: string[] = [];

  const name =
    typeof body.name === 'string' ? String(body.name).trim().replace(/\s+/g, ' ').slice(0, 100) : '';
  const company = typeof body.company === 'string' ? String(body.company).trim().slice(0, 100) : '';
  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? body.amount : 0;

  let email: string | null = null;
  if (typeof body.email === 'string' && String(body.email).trim()) {
    email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`email 格式无效：${email}`);
      email = null;
    }
  } else {
    warnings.push('email 缺失');
  }

  // 价值分级（与 crm-customer-risk Skill 阈值对齐的量级）
  const valueTier = amount >= 100_000 ? 'high' : amount >= 10_000 ? 'medium' : 'low';
  if (amount > 0 && valueTier === 'high') {
    warnings.push('高价值线索：金额 ≥ ¥100,000，建议优先跟进');
  }

  return { name, email, company, amount, valueTier, warnings };
}

export const CRM_IMPORT_WEBHOOK_PLUGIN: PluginManifest = {
  name: 'crm-import-webhook',
  version: '1.0.0',
  description: '示例第三方插件：CRM 客户导入标准化（字段清洗 + 价值分级 + 宿主探测，只读）',
  capabilities: ['plugin.crm-import-webhook', 'crm.lead-intake'],
  requires: ['CrmService'],
  featureFlag: 'crm',
  hooks: {
    onAppStart: (ctx) => {
      // POST /api/v1/plugins/crm-import-webhook/normalize 统一入口（见 plugins.controller.ts）
      ctx.registerRoute('/plugins/crm-import-webhook/normalize', (req) => {
        // 宿主服务访问：探测 CrmService（AI CRM 旗舰）列表能力是否可用
        const crm = ctx.getService('CrmService');
        const crmServiceAvailable =
          !!crm && typeof (crm as { listCustomers?: unknown }).listCustomers === 'function';

        return {
          plugin: 'crm-import-webhook',
          ok: true,
          lead: normalizeLead(req),
          host: {
            crmServiceAvailable,
            crmFeatureEnabled: ctx.isFeatureEnabled('crm'),
          },
        };
      });
    },
  },
};
