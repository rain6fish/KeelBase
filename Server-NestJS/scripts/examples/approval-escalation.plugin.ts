/**
 * 示例第三方插件 approval-escalation（业务增强：审批 SLA 升级评估）。
 *
 * 演示插件机制三个能力：
 * - registerRoute：注册 /plugins/approval-escalation/evaluate HTTP 端点（只读）
 * - getService：按名称访问宿主 ApprovalService（AI Approval 旗舰）
 * - isFeatureEnabled：读取 approval 特性开关
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

/** SLA 升级评估（纯函数）：按等待时长分级，金额兜底高价值复核。 */
function evaluateEscalation(
  raw: unknown,
  now: Date,
): { waitMinutes: number; tier: string; highValue: boolean; recommendation: string } {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  let waitMinutes: number;
  if (typeof body.waitMinutes === 'number' && Number.isFinite(body.waitMinutes)) {
    waitMinutes = Math.max(0, body.waitMinutes);
  } else if (typeof body.submittedAt === 'string' && !Number.isNaN(new Date(body.submittedAt).getTime())) {
    waitMinutes = Math.max(0, Math.floor((now.getTime() - new Date(body.submittedAt).getTime()) / 60000));
  } else {
    waitMinutes = 0;
  }

  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? body.amount : 0;
  const highValue = amount >= 100_000;

  // SLA 分级：≥24h 升级经理 / ≥8h 升级主管 / 其余 on_sla；高金额在 SLA 内也建议加急复核
  const tier = waitMinutes >= 1440 ? 'level2' : waitMinutes >= 480 ? 'level1' : 'on_sla';
  const recommendation =
    tier === 'level2'
      ? '等待 ≥ 24h：升级至经理审批'
      : tier === 'level1'
        ? '等待 ≥ 8h：升级至主管审批'
        : highValue
          ? 'SLA 内但金额 ≥ ¥100,000：建议加急复核'
          : 'SLA 内，保持正常处理';

  return { waitMinutes, tier, highValue, recommendation };
}

export const APPROVAL_ESCALATION_PLUGIN: PluginManifest = {
  name: 'approval-escalation',
  version: '1.0.0',
  description: '示例第三方插件：审批请求 SLA 升级评估（等待时长分级 + 金额兜底 + 宿主探测，只读）',
  capabilities: ['plugin.approval-escalation', 'approval.sla'],
  requires: ['ApprovalService'],
  featureFlag: 'approval',
  hooks: {
    onAppStart: (ctx) => {
      // POST /api/v1/plugins/approval-escalation/evaluate 统一入口（见 plugins.controller.ts）
      ctx.registerRoute('/plugins/approval-escalation/evaluate', (req) => {
        // 宿主服务访问：探测 ApprovalService（AI Approval 旗舰）预审能力是否可用
        const approval = ctx.getService('ApprovalService');
        const approvalServiceAvailable =
          !!approval && typeof (approval as { reviewRequest?: unknown }).reviewRequest === 'function';

        return {
          plugin: 'approval-escalation',
          ok: true,
          evaluation: evaluateEscalation(req, new Date()),
          host: {
            approvalServiceAvailable,
            approvalFeatureEnabled: ctx.isFeatureEnabled('approval'),
          },
        };
      });
    },
  },
};
