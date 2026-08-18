/**
 * 示例旗舰插件 approval-intake（PL-11 第三方安装路径演示）。
 *
 * 演示插件机制三个能力：
 * - registerRoute：注册 /plugins/approval-intake/precheck HTTP 端点
 * - getService：按名称访问宿主 ApprovalService（AI Approval 旗舰）
 * - isFeatureEnabled：读取 approval 特性开关
 *
 * 本文件是可被 `keelbase-plugin add` 直接复制的自包含源码：
 * 第三方在自仓库作者化源码时无宿主编译上下文，故本地声明与宿主一致的
 * PluginManifest/PluginContext 形状（结构校验）；复制进宿主后由 PluginsService
 * 校验依赖（requires）与特性开关（featureFlag），运行时无宿主类型依赖。
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

export const APPROVAL_INTAKE_PLUGIN: PluginManifest = {
  name: 'approval-intake',
  version: '1.0.0',
  description: '示例旗舰插件：审批预检端点（演示宿主服务访问 + 特性开关 + 路由注册）',
  capabilities: ['plugin.approval-intake', 'approval.precheck'],
  requires: ['ApprovalService'],
  featureFlag: 'approval',
  hooks: {
    onAppStart: (ctx) => {
      // POST /api/v1/plugins/approval-intake/precheck 统一入口（见 plugins.controller.ts）
      ctx.registerRoute('/plugins/approval-intake/precheck', (req) => {
        // 防御式解析请求体（body 可能是任意 JSON，null/数组/字符串等）
        const body = (typeof req === 'object' && req !== null ? req : {}) as Record<string, unknown>;
        const type = typeof body.type === 'string' && body.type ? String(body.type).slice(0, 50) : 'general';
        const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? (body.amount as number) : 0;

        // 宿主服务访问：探测 ApprovalService（AI Approval 旗舰）review 能力是否可用
        const approval = ctx.getService('ApprovalService');
        const approvalReady = !!approval && typeof (approval as { reviewRequest?: unknown }).reviewRequest === 'function';

        // 旗舰政策预审规则（与 approval-policy-review Skill 一致）：金额分级
        const riskLevel = amount <= 1000 ? 'low' : amount > 3000 ? 'high' : 'medium';
        const recommendation =
          riskLevel === 'low' ? '自动通过（金额 ≤ ¥1000 阈值）' : '转人工复核（超出政策阈值）';

        return {
          plugin: 'approval-intake',
          ok: true,
          precheck: { type, amount, riskLevel, recommendation },
          host: {
            approvalServiceAvailable: approvalReady,
            approvalFeatureEnabled: ctx.isFeatureEnabled('approval'),
          },
        };
      });
    },
  },
};
