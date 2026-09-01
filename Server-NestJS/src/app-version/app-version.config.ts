// SPDX-License-Identifier: Apache-2.0

/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.0.3',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['护城河 2.0：独立治理台 + sidecar 零代码接入 + 工具门控 + 多系统单控制面', 'Trust 证明包六场景一键验证 + R5 阻断 + DemoProvider 确定性可用', '审计可视化 E-1/E-2/D4（字段级审计/哈希链视图/证据包导出）+ 关键路径性能 E-3', '发布前三方评审加固：哈希链锁行/操作审计并发/副作用类型映射/侧边车鉴权'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
