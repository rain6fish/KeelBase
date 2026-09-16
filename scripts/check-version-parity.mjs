#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 版本对账门：发版线各清单必须同版本，lockfile 根版本字段必须跟随其清单。
 *
 * 背景（2026-09-16 实证）：1.0.4 起发版只 bump 四端清单，**仓库根 `package.json` 自 1.0.3 起停更**——
 * 而 `scripts/generator/manifest.mjs` 的 `generatorVersion()` 读的正是根 `package.json`
 * → 每个 `keelbase init` 生成的模块把 `generatorVersion: "1.0.3"` 写进
 * `.keelbase/manifest.json` 与 `.keelbase-provenance.json`（来源身份错版），
 * `keelbase inspect` / `doctor` 也据此自报——且 doctor 的版本/兼容矩阵检查
 * 拿同一个脏源自比，自洽通过成假绿。
 *
 * 发版线（v* 标签一起发布、版本号必须一致）：
 *   - package.json                  根（= npm `keelbase` CLI 包 + 生成器来源身份）
 *   - Server-NestJS/package.json
 *   - Web-Admin-Vue/package.json
 *   - Front-Taro/package.json
 *   - Front-Flutter/pubspec.yaml
 *
 * 显式排除（不是漏掉，是决策）：Web-Admin-React/package.json —— 预览版（0.1.0），
 * 官方未表态转正前不随发版线走（roadmap §2.2 KB-7 前端表态）。
 *
 * 零依赖（node:fs）。CI：node scripts/check-version-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** 发版线清单（顺序仅作输出顺序） */
const RELEASE_MANIFESTS = [
  { path: 'package.json', kind: 'json' },
  { path: 'Server-NestJS/package.json', kind: 'json' },
  { path: 'Web-Admin-Vue/package.json', kind: 'json' },
  { path: 'Front-Taro/package.json', kind: 'json' },
  { path: 'Front-Flutter/pubspec.yaml', kind: 'pubspec' },
];

/** 不随发版线走的清单（显式登记，防「忘了加」与「以为漏了」两种误判） */
const EXCLUDED_MANIFESTS = [
  { path: 'Web-Admin-React/package.json', reason: '预览版（0.1.0），未表态转正前不随发版线' },
];

/** lockfile 根版本字段须跟随的清单 */
const LOCK_PARITY = [
  { lock: 'package-lock.json', manifest: 'package.json' },
  { lock: 'Server-NestJS/package-lock.json', manifest: 'Server-NestJS/package.json' },
  { lock: 'Web-Admin-Vue/package-lock.json', manifest: 'Web-Admin-Vue/package.json' },
  { lock: 'Front-Taro/package-lock.json', manifest: 'Front-Taro/package.json' },
];

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

const rows = [];
const errors = [];

for (const m of RELEASE_MANIFESTS) {
  rows.push({ label: m.path, version: manifestVersion(m.path, m.kind) });
}

/** 发版线版本 = 多数清单的版本（单个清单掉队时，报「掉队者 vs 发版线」，而非被掉队者带偏） */
function expectedVersion(versions) {
  const tally = new Map();
  for (const v of versions) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best = versions[0];
  for (const [v, n] of tally) if (n > (tally.get(best) ?? 0)) best = v;
  return best;
}

const expected = expectedVersion(rows.map((r) => r.version));
for (const r of rows) {
  if (r.version !== expected) {
    errors.push(`${r.label} = ${r.version}，应为 ${expected}（本次发版线版本）`);
  }
}

for (const { lock, manifest } of LOCK_PARITY) {
  const want = manifestVersion(manifest, 'json');
  let pkg;
  try {
    pkg = JSON.parse(read(lock));
  } catch {
    errors.push(`${lock}: 无法解析`);
    continue;
  }
  const fields = [
    ['version', pkg.version],
    ['packages[""].version', pkg.packages?.['']?.version],
  ];
  for (const [name, got] of fields) {
    rows.push({ label: `${lock} (${name})`, version: got ?? '(缺失)' });
    if (got !== want) {
      errors.push(`${lock} 的 ${name} = ${got ?? '(缺失)'}，应为 ${want}（跟随 ${manifest}）`);
    }
  }
}

console.log('版本对账门 / Version parity gate');
console.log('────────────────────────────────');
for (const r of rows) console.log(`  ${r.version.padEnd(12)} ${r.label}`);
for (const e of EXCLUDED_MANIFESTS) console.log(`  ${'(排除)'.padEnd(10)} ${e.path} — ${e.reason}`);

if (errors.length > 0) {
  console.error('\n✗ 版本不一致：');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n发版时须同步 bump 发版线全部清单 + 各 lockfile 根版本字段（见 docs/manual/release-precheck.md）。');
  process.exit(1);
}

console.log(`\n✓ 一致：发版线 ${rows.length - LOCK_PARITY.length * 2} 个清单 + ${LOCK_PARITY.length} 个 lockfile 全部 = ${expected}`);
