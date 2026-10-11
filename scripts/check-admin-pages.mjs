#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Every admin page in the tree must be named in the module map `CLAUDE.md` §13 carries.
 *
 * That line is the page map an agent reads before touching the console — which pages exist, and where
 * each one lives. It had drifted to nineteen entries against forty-one view directories: the whole
 * organisation, permission, governance-policy, risk, security, Agent-registry, AI-approval, MCP and
 * operations group was missing, along with the generated modules' pages. Nothing compared the two, so
 * the list kept its old shape while the console grew.
 *
 * The line names each page's directory in backticks, so the comparison is mechanical. `403` is an error
 * page rather than a module and is exempt — with its reason written here.
 *
 * 管理台里每一个页面，都必须在 `CLAUDE.md` §13 那份页面地图里点名。
 *
 * 那行是 agent 动控制台之前读的页面地图 —— 有哪些页、各自在哪。它曾漂到「**19** 条 vs **41** 个 views 目录」：
 * 组织、权限、治理策略、风险、安全、Agent 注册、AI 审批、MCP、运维**整组都不在里面**，生成模块的页面也没有。
 * 没有东西比对两者，于是控制台长大了、清单还留着旧形状。
 *
 * 该行把每个页面的目录名写在反引号里，故比对是机械的。`403` 是错误页而非模块，豁免 —— 理由就写在这里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = 'Web-Admin-Vue/src/views';
const DOC = 'CLAUDE.md';

// Not a module: the error page. Each exemption states its reason.
// 不是模块：错误页。豁免一律写明理由。
const EXEMPT = new Set(['403']);

const line = fs
  .readFileSync(path.join(ROOT, DOC), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('**模块**'));

if (!line) {
  console.error(`[admin-pages] 在 ${DOC} 里找不到「**模块**」那一行（§13 的页面地图）`);
  process.exit(1);
}
const named = new Set([...line.matchAll(/`([a-z0-9_-]+)`/g)].map((m) => m[1]));

const dirs = fs
  .readdirSync(path.join(ROOT, VIEWS))
  .filter((d) => fs.statSync(path.join(ROOT, VIEWS, d)).isDirectory());

const missing = dirs.filter((d) => !named.has(d) && !EXEMPT.has(d)).sort();
const stale = [...named].filter((n) => !dirs.includes(n)).sort();

const failures = [
  ...missing.map((d) => `${VIEWS}/${d} — 页在、${DOC} §13 的模块清单里没有它`),
  ...stale.map((n) => `${DOC} §13 点名了 \`${n}\`，但 ${VIEWS}/${n} 不存在`),
];

if (failures.length > 0) {
  console.error(`\n[admin-pages] ${failures.length} 处：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n把页面加进 ${DOC} §13 的「**模块**」行（括号里写目录名）；确实不是页面的，在 EXEMPT 里写明理由。\n` +
      `Add the page to that line (directory in backticks) — or exempt it in EXEMPT with a reason.\n`,
  );
  process.exit(1);
}
console.log(`[admin-pages] ${dirs.length} 个 views 目录与 ${DOC} §13 的模块清单一一对应（豁免 ${EXEMPT.size}）✓`);
