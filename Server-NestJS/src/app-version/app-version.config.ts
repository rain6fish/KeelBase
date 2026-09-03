// SPDX-License-Identifier: Apache-2.0

/**
 * 应用版本元数据（基座静态配置）。
 * 发布新版本时更新 latestVersion + changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: '1.0.5',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['AI Follow-up Agent：AI 主动发现长期未跟进客户并建议跟进', 'AI Bridge 代理工具免重启热更新', 'AI 审计证据语义：放行授权快照 + 越权尝试一级事件 + 审批语义 + 生命周期流转', '安全演示（对抗性证明）：确定性场景一键运行，防线漂移即 fail-loud', '全库健康体检 + 授权子域下沉切 import 环 + 协议合规认证进 CI'],
} as const;

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
