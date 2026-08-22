/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.0.0',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['KeelBase 1.0：Business-safe AI Application Base（三件套）', 'AI CRM Golden Application 一次跑通闭环（读→风险→建跟进→确认→写→审计→撤销）', 'Application Protocol 生成器（协议化配置 → 生成带权限/AI 工具/确认/审计的模块）', 'Runtime 治理：CASL / 写操作确认 / 审计哈希链 / 副作用撤销 / Explainable Authz', '私有 AI 全链路（数据不出域）+ 管理台 Element Plus'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
