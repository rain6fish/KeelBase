/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.0.1',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['AI 每日限额并发原子化（S3）+ WS 节流窗口命名（S4）', 'System AI 来源身份（读来源清单答「这是什么系统」）+ doctor 兼容矩阵', '测试覆盖大幅提升（后端 92.7% / 前端 vitest 75.5% / Flutter）'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
