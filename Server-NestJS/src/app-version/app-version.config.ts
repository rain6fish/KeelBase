// SPDX-License-Identifier: Apache-2.0

/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.0.4',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['§22.16 业务行为取证系统：字段级留痕 + 决策依据 + 业务事件归一化 + 实体行为史账本 + 审计解释器 + 身份链授权依据 + 合规证据包 v2', '治理护城河 2.1/2.2/2.3：协议合规套件 + MCP 治理契约 + 策略实时推送 + 模板库 + 合规映射 + 证据包离线验证', '四端业务语言化 + 产品语言统一（Business-safe AI Runtime + DNA + Trust Manifesto）', 'EASY-5 首启引导 preset + Apache-2.0 开源可信包装'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
