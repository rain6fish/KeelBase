#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 版本对账门：**发版线成员**须等于产品版本；其余清单各自持版；两个运行时权威源直检。
 *
 * 这道门不是为了「同版本而同版本」。产品版本只有一个真源 = **根 `package.json`**，
 * 而它被两处**运行时权威**读取，读的却是**两个不同的清单**：
 *   - `scripts/generator/manifest.mjs` 的 `generatorVersion()` → 写进
 *     `.keelbase/manifest.json` / `.keelbase-provenance.json`（生成物来源身份）
 *   - `Server-NestJS/src/app-version/app-version.config.ts` → `/app/version`、
 *     管理台「应用版本」行、AI 上下文
 * 把它们锁在一起，正是本门禁的原职责。
 *
 * 历史（2026-09-16 实证）：1.0.4 起只 bump 四端清单，根 `package.json` 自 1.0.3 起停更 →
 * 生成物 `generatorVersion` 错版，且 doctor 拿同一个脏源自比，自洽通过成**假绿**。
 * 当时用的检查是「五端同版本」这个**代理**。
 *
 * 2026-09-22 松动：把**清单版本**（packaging）与**产品版本**分开。
 *   - **发版线成员**（须 = 产品版本）：根 `package.json`、`Server-NestJS/package.json`。
 *     只有这两个是运行时权威源，掉队会直接产生对外错版。
 *   - **独立清单**（各自持版，须合法 semver）：三端前端 + React 预览版。前端与后端
 *     不必同号——这是拆仓前必须解开的一处耦合。
 *   - 代理换成**直检**：显式断言两个运行时权威源就在发版线成员内，故成员表即便日后被改小，
 *     也不可能再出现「权威源停更」这一类事故。
 *   - 另补一查（原门禁的漏）：前端**对外显示**的产品版本常量必须跟随产品版本。此前
 *     Flutter 显示 0.9.2、Taro 显示 1.0.0 已与发版线脱节多版，而门禁全绿。
 *   - lockfile 根版本字段仍跟随**其自身清单**（与拆仓无关，纯正确性）。
 *
 * 零依赖（node:fs）。CI：node scripts/check-version-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SEMVER = /^\d+\.\d+\.\d+/;

/** 发版线成员：版本须 == 产品版本（= 根 package.json 的版本） */
const RELEASE_LINE_MEMBERS = [
  { path: 'package.json', kind: 'json', role: '产品版本真源 + 生成器来源身份' },
  { path: 'Server-NestJS/package.json', kind: 'json', role: '后端运行时版本（/app/version）' },
];

/** 独立清单：各自持版，不受产品版本约束（值仍须合法 semver） */
const INDEPENDENT_MANIFESTS = [
  { path: 'Web-Admin-Vue/package.json', kind: 'json', reason: 'Web 宿主：自带版本，不随产品号' },
  { path: 'Front-Taro/package.json', kind: 'json', reason: 'Taro：自带版本，不随产品号' },
  { path: 'Front-Flutter/pubspec.yaml', kind: 'pubspec', reason: '移动主 App：自带版本，不随产品号' },
  { path: 'Web-Admin-React/package.json', kind: 'json', reason: '预览版，未表态转正' },
];

/**
 * 运行时权威源：读某个清单来**对外报告**产品版本。其 `reads` 必须是发版线成员——
 * 直检这条，替代原先「五端同版本」的代理检查。
 */
const RUNTIME_AUTHORITIES = [
  {
    what: '生成物 provenance（来源身份）',
    source: 'scripts/generator/manifest.mjs',
    reads: 'package.json',
  },
  {
    what: '/app/version + 管理台「应用版本」行',
    source: 'Server-NestJS/src/app-version/app-version.config.ts',
    reads: 'Server-NestJS/package.json',
  },
];

/** 前端**对外显示**的产品版本常量：须跟随产品版本（原门禁漏掉的一类） */
const DISPLAY_CONSTANTS = [
  {
    label: 'Flutter 设置页',
    path: 'Front-Flutter/lib/core/constants/app_constants.dart',
    pattern: /appVersion\s*=\s*'([^']+)'/,
  },
  {
    label: 'Taro 设置页',
    path: 'Front-Taro/src/pages/settings/index.vue',
    pattern: /appVersion\s*=\s*ref\('([^']+)'\)/,
  },
];

/** lockfile 根版本字段须跟随的清单 */
const LOCK_PARITY = [
  { lock: 'package-lock.json', manifest: 'package.json' },
  { lock: 'Server-NestJS/package-lock.json', manifest: 'Server-NestJS/package.json' },
  { lock: 'Web-Admin-Vue/package-lock.json', manifest: 'Web-Admin-Vue/package.json' },
  { lock: 'Front-Taro/package-lock.json', manifest: 'Front-Taro/package.json' },
];

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** 读清单版本：JSON 取 `version`；pubspec 取 `version:` 的 `x.y.z`（丢弃 `+build` 段） */
function manifestVersion(rel, kind) {
  const text = read(rel);
  if (kind === 'pubspec') {
    const m = text.match(/^version:\s*(\d+\.\d+\.\d+)/m);
    if (!m) throw new Error(`${rel}: 未找到 version: x.y.z`);
    return m[1];
  }
  const v = JSON.parse(text).version;
  if (!v) throw new Error(`${rel}: 未找到 version 字段`);
  return v;
}

const errors = [];
const rows = [];

// ── 1. 产品版本 = 根 package.json（单一真源，不新增第二处版本）──
const product = manifestVersion('package.json', 'json');
if (!SEMVER.test(product)) errors.push(`package.json 的产品版本 ${product} 不是合法 semver`);

// ── 2. 发版线成员须 == 产品版本 ──
for (const m of RELEASE_LINE_MEMBERS) {
  const v = manifestVersion(m.path, m.kind);
  rows.push({ label: m.path, version: v, tag: '发版线' });
  if (v !== product) {
    errors.push(`${m.path} = ${v}，应为 ${product}（发版线成员：${m.role}）`);
  }
}

// ── 3. 独立清单：各自持版，仅要求合法 semver ──
for (const m of INDEPENDENT_MANIFESTS) {
  const v = manifestVersion(m.path, m.kind);
  rows.push({ label: m.path, version: v, tag: '独立' });
  if (!SEMVER.test(v)) errors.push(`${m.path} 的版本 ${v} 不是合法 semver`);
}

// ── 4. 直检：运行时权威源必须在发版线成员内（防「代理换成直检」后再被改小）──
const memberPaths = new Set(RELEASE_LINE_MEMBERS.map((m) => m.path));
for (const a of RUNTIME_AUTHORITIES) {
  if (!memberPaths.has(a.reads)) {
    errors.push(
      `运行时权威源 ${a.source}（${a.what}）读 ${a.reads}，但该清单不在发版线成员内 —— ` +
        `一旦它与产品版本脱节，生成物/对外版本即错版且自比成假绿`,
    );
  }
}

// ── 5. 前端对外显示的产品版本常量须跟随产品版本 ──
for (const c of DISPLAY_CONSTANTS) {
  const m = read(c.path).match(c.pattern);
  if (!m) {
    errors.push(`${c.path}: 未匹配到显示版本常量（${c.label}）`);
    continue;
  }
  rows.push({ label: `${c.path} (显示)`, version: m[1], tag: '显示' });
  if (m[1] !== product) {
    errors.push(`${c.path} 显示的版本 = ${m[1]}（${c.label}），应为 ${product}`);
  }
}

// ── 6. lockfile 根版本字段跟随其自身清单 ──
for (const { lock, manifest } of LOCK_PARITY) {
  const want = manifestVersion(manifest, 'json');
  let pkg;
  try {
    pkg = JSON.parse(read(lock));
  } catch {
    errors.push(`${lock}: 无法解析`);
    continue;
  }
  for (const [name, got] of [
    ['version', pkg.version],
    ['packages[""].version', pkg.packages?.['']?.version],
  ]) {
    rows.push({ label: `${lock} (${name})`, version: got ?? '(缺失)', tag: 'lock' });
    if (got !== want) {
      errors.push(`${lock} 的 ${name} = ${got ?? '(缺失)'}，应为 ${want}（跟随 ${manifest}）`);
    }
  }
}

console.log('版本对账门 / Version parity gate');
console.log(`产品版本 / Product version：${product}（单一真源 = package.json）`);
console.log('────────────────────────────────');
for (const r of rows) console.log(`  ${r.tag.padEnd(6)} ${r.version.padEnd(12)} ${r.label}`);
for (const m of INDEPENDENT_MANIFESTS) console.log(`  ${'(独立)'.padEnd(4)} ${m.path} — ${m.reason}`);

if (errors.length > 0) {
  console.error('\n✗ 版本不一致：');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n发版时须同步 bump 发版线成员 + 各 lockfile 根版本字段；前端显示版本常量跟随产品版本（见 docs/manual/release-precheck.md）。');
  process.exit(1);
}

console.log(
  `\n✓ 通过：发版线 ${RELEASE_LINE_MEMBERS.length} 个成员 = ${product}；` +
    `${INDEPENDENT_MANIFESTS.length} 个独立清单各自持版；` +
    `lockfile ${LOCK_PARITY.length} 个跟随其清单；显示常量 ${DISPLAY_CONSTANTS.length} 处跟随产品版本`,
);
