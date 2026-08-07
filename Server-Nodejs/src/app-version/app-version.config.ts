/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.1.0',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['新增待办清单', '通知深链跳转', '修复已知问题'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
