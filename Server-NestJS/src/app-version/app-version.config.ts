/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '0.9.1',
  minRequiredVersion: '0.9.1',
  updateUrl: 'https://example.com/download',
  changelog: ['AI 治理策略化 + 每日限额独立计数（HS-9/0.9.1）', '签到/积分/成就（GROWTH-3）', '组织级待办隔离 + AI 织入工具', '401 刷新 single-flight / SSE 行缓冲 / Provider 竞态全面修复', '管理台运维单页（D.8）'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
