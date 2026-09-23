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

/** Current product version — the **single read point**. The release notes below are keyed by it too,
 *  so the two can never disagree by reading the manifest twice.
 *  当前产品版本 —— **唯一读取点**；下面的更新要点也按它索引，两处不会因各读一次而漂。 */
const PRODUCT_VERSION = readPackageVersion();

/**
 * Release notes keyed by version — the "what's new" the upgrade prompt shows the user.
 *
 * **Why keyed by version**: this used to be a flat array replaced by hand at release time. Both the
 * 1.0.10 and 1.0.11 releases forgot to replace it, so the upgrade prompt kept advertising **1.0.9**
 * features — the same shape of accident as the `latestVersion` one above, only this time the stale
 * part was the prose. With a map, a version that has no entry yields an **empty list** (an honest
 * "no notes"), and an old version's notes can never be presented as the current release's. A unit
 * test pins "the current product version has an entry", so bumping the version without writing notes
 * turns red immediately (see `app-version.service.spec.ts`).
 *
 * Only versions still in service are kept: older notes live in `CHANGELOG.md` (the authoritative
 * history), and unreachable data is dead weight here.
 *
 * 按版本索引的对外更新要点（PL-5 升级提示里给用户看的「这版有什么」）。
 *
 * **为什么按版本索引**：原先是**一个平铺数组**、靠发版时人工替换 —— 1.0.10 与 1.0.11 两次发版都忘了，
 * 于是升级提示一直在讲 **1.0.9** 的功能（与上面 `latestVersion` 那起事故同型，只是漏的是文案）。
 * 改成 map 后：当前版本没有条目 → 返回**空列表**（诚实地「没有要点」），**绝不会把旧版要点当新版展示**。
 * 配套单测卡住「产品版本在 map 里没有条目」，bump 了版本却没写要点会立刻变红。
 *
 * 只保留**当前仍在服务**的版本；更早的要点由 `CHANGELOG.md` 承载（权威历史），此处不留不可达的旧数据。
 */
const RELEASE_NOTES: Record<string, readonly string[]> = {
  '1.0.11': [
    '业务级补偿：确认卡说明「将动到什么、事后能不能收回」，一个业务动作的多表副作用可一次补偿',
    '访客标识：共用同一账号的演示访客，在审计轨迹上也能区分',
    '审计行可下钻到它来自的那次对话（先给结构，正文须再显式请求）',
    '证据包支持国密 SM2 签名，且不使旧包失效',
    'AI 异常行为基线：对异常行为告警但不阻断',
    '「等我处理」中心：待确认的写操作可在对话之外裁决',
  ],
  '1.0.10': [
    '通用数据范围 + 角色数据范围配置化（改配置即生效）',
    '审计归因层：真实客户端 IP 与入口来源可追溯',
    '证据交付物：离线自包含 HTML 报告（单动作 / 期间 / 人读决策说明）',
    'wire 契约收口：CASL 决策、审计查询行、数据范围、MCP 投影等入契约',
  ],
};

/**
 * 应用版本元数据。
 * `latestVersion` 自动取自 package.json（不可手写）；`changelog` 按当前版本自动取（不可手写）；
 * 需强制升级时提升 minRequiredVersion。
 */
export const APP_VERSION = {
  latestVersion: PRODUCT_VERSION,
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: RELEASE_NOTES[PRODUCT_VERSION] ?? [],
};

export type AppVersionInfo = {
  latestVersion: string;
  minRequiredVersion: string;
  updateUrl: string;
  changelog: readonly string[];
};
