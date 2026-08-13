/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '0.9.0',
  minRequiredVersion: '0.9.0',
  updateUrl: 'https://example.com/download',
  changelog: ['业务安全的 AI Agent harness（工具限定数据范围 + 写操作确认）', 'Flutter + 小程序 + PC 管理台三端', 'CASL 行级权限 + 全链路审计'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
