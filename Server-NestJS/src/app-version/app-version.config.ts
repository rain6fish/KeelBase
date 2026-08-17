/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '0.9.2',
  minRequiredVersion: '0.9.1',
  updateUrl: 'https://example.com/download',
  changelog: ['首启预设引导 + capabilities 三端导航联动（EASY-5/MOD-4）', '流式 AI provider fallback + SSE 断流重连（CR-28/CR-17）', '微信小程序登录 + 订阅消息（MINI-3/2）', 'TOTP 双因素 + 强制改密（WEB-FRONT-4）', '读写分离 / K8s / 蓝绿部署（3.3/D.2/D.3）'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
