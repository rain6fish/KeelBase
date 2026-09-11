// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 运行时版本：**单一真源 = package.json**（发版 bump 只需改包版本，不需再"五处同步"）。
 *
 * 历史（2026-09-11 修）：`latestVersion` 曾手写在下方常量里、靠发版时的人工纪律同步——1.0.7 / 1.0.8
 * 两次 bump 均漏更新此处，于是 `GET /app/version`（PL-5 更新决策）、管理台「应用版本」行、AI 评测
 * 与系统 AI 上下文全部对外显示 **1.0.6**（落后两个已发布版本）。改为读 package.json 后结构上不可能再漂
 * （`src/app-version/` 与 `dist/app-version/` 到包根的相对深度一致，同一路径两种运行方式都成立）。
 */
function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 应用版本元数据。
 * `latestVersion` 自动取自 package.json（不可手写）；发布新版本时更新 changelog；需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: readPackageVersion(),
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['AI Follow-up Agent：AI 主动发现长期未跟进客户并建议跟进', 'AI Bridge 代理工具免重启热更新', 'AI 审计证据语义：放行授权快照 + 越权尝试一级事件 + 审批语义 + 生命周期流转', '安全演示（对抗性证明）：确定性场景一键运行，防线漂移即 fail-loud', '全库健康体检 + 授权子域下沉切 import 环 + 协议合规认证进 CI'],
};

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
