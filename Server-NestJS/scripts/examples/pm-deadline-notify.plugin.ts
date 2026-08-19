/**
 * 示例第三方插件 pm-deadline-notify（业务增强：项目截止预警）。
 *
 * 演示插件机制三个能力：
 * - registerRoute：注册 /plugins/pm-deadline-notify/scan HTTP 端点（只读）
 * - getService：按名称访问宿主 PmService（AI Project 旗舰）
 * - isFeatureEnabled：读取 pm 特性开关
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

/** 待扫描的截止项（任务/里程碑通用形状）。 */
interface DeadlineItem {
  name: string;
  dueDate: string;
  status?: string;
}

/** 截止扫描（纯函数）：逾期 + 临期统计。dueDate 为 ISO 字符串，now 便于测试注入。 */
function scanDeadlines(
  raw: unknown,
  now: Date,
): { totalCount: number; overdueCount: number; nearDueCount: number; nearDays: number } {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const nearDays =
    typeof body.nearDays === 'number' && Number.isFinite(body.nearDays)
      ? Math.min(30, Math.max(1, Math.floor(body.nearDays)))
      : 3;

  const list = Array.isArray(body.items) ? body.items : [];
  let totalCount = 0;
  let overdueCount = 0;
  let nearDueCount = 0;

  for (const item of list) {
    const it = (typeof item === 'object' && item !== null ? item : {}) as Partial<DeadlineItem>;
    if (typeof it.name !== 'string' || typeof it.dueDate !== 'string') continue;
    const due = new Date(it.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    totalCount++;
    // 已完成项不计入逾期/临期
    if (it.status === 'completed' || it.status === 'done') continue;
    const diffMs = due.getTime() - now.getTime();
    if (diffMs < 0) overdueCount++;
    else if (diffMs <= nearDays * 24 * 60 * 60 * 1000) nearDueCount++;
  }

  return { totalCount, overdueCount, nearDueCount, nearDays };
}

export const PM_DEADLINE_NOTIFY_PLUGIN: PluginManifest = {
  name: 'pm-deadline-notify',
  version: '1.0.0',
  description: '示例第三方插件：项目任务/里程碑截止扫描（逾期 + 临期预警 + 宿主探测，只读）',
  capabilities: ['plugin.pm-deadline-notify', 'pm.deadline-alert'],
  requires: ['PmService'],
  featureFlag: 'pm',
  hooks: {
    onAppStart: (ctx) => {
      // POST /api/v1/plugins/pm-deadline-notify/scan 统一入口（见 plugins.controller.ts）
      ctx.registerRoute('/plugins/pm-deadline-notify/scan', (req) => {
        // 宿主服务访问：探测 PmService（AI Project 旗舰）风险分析能力是否可用
        const pm = ctx.getService('PmService');
        const pmServiceAvailable =
          !!pm && typeof (pm as { analyzeProjectRisk?: unknown }).analyzeProjectRisk === 'function';

        return {
          plugin: 'pm-deadline-notify',
          ok: true,
          scan: scanDeadlines(req, new Date()),
          host: {
            pmServiceAvailable,
            pmFeatureEnabled: ctx.isFeatureEnabled('pm'),
          },
        };
      });
    },
  },
};
