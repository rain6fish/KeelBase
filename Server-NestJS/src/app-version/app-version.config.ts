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
  changelog: [
    '业务访谈直生成（Consulting→Build）：Business Spec → 确定性协议 → 生成模块，全链路进 CI',
    'Enterprise Proof 与 S5 合流：两主张一次运行同证（断言化）',
    '前端 Runtime-Neutrality：信封/错误/刷新增适配层，三端按 capabilities/provenance 驱动导航',
    '跨入口决策一致（T5）：sidecar 放行依据与 REST/SSE 同形，MCP 拒绝留痕',
    '首次运行就绪清单：GET /app/readiness 五维 + 每维可执行下一步',
    'run 级批量撤销 + 决策词汇统一（approve|decline，wire Schema v2）',
  ],
};

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
