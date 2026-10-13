#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The "KeelBase family" section is generated, and this verifies that the copy in this repository
 * still matches the stamp it was generated with.
 *
 * Each marked region carries `sha256:` of its own body on its BEGIN line. The body comes from
 * `docs/ecosystem.md` in the main repository, so every copy in every repository is byte-identical —
 * which means this file can verify its own repository with no sibling checkout and no network access.
 * That matters: CI checks out one repository, and the family's repositories are on different hosts.
 *
 * This file is itself generated — an identical copy lives in each repository of the family, and the
 * main repository's sync script keeps the copies byte-identical. Run it anywhere; it only ever reads
 * the READMEs at the root of the repository it sits in.
 *
 * 「KeelBase 家族」段是生成的，本脚本校验本仓里那一份是否仍与生成时的戳相符。
 *
 * 每个标记区在 BEGIN 行带自身内容的 `sha256:`。内容来自主仓的 `docs/ecosystem.md`，故各仓里的每一份都
 * 逐字节一致——于是本文件能在**不检出兄弟仓、不联网**的前提下校验本仓。这一点很要紧：CI 只检出本仓，
 * 而家族各仓分布在不同主机上。
 *
 * 本文件自身也是生成的——每个仓里都有一份完全相同的副本，由主仓的同步脚本保持逐字节一致。在任何仓里
 * 都能跑；它只读自己所在仓根目录下的 README。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = ['README.md', 'README.zh-CN.md'];

const BEGIN = '<!-- BEGIN keelbase-family:';
const REGION_RE =
  /<!-- BEGIN keelbase-family:([a-z]{2}) sha256:([0-9a-f]{64}) -->\n([\s\S]*?)\n<!-- END keelbase-family:\1 -->/g;

const failures = [];
let files = 0;
let regions = 0;

for (const file of CANDIDATES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  files += 1;

  const text = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  let found = 0;

  for (const m of text.matchAll(REGION_RE)) {
    found += 1;
    regions += 1;
    const [, region, stamp, body] = m;
    const actual = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    if (actual !== stamp) {
      failures.push(
        `${file}：「KeelBase 家族」段 :${region} 已被手改` +
          `（标记 ${stamp.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`,
      );
    }
  }

  if (found === 0) {
    failures.push(
      text.includes(BEGIN)
        ? `${file}：标记行缺 sha256 戳，需跑一次同步 / region present but unstamped — run the sync script`
        : `${file}：找不到「KeelBase 家族」标记区 / no family-block region found`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\n[family-block] ${failures.length} 处 / ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n这一段是生成的：改主仓的 docs/ecosystem.md，再跑同步脚本——不要手改本仓 README 里那一段。`);
  console.error(`This section is generated: edit docs/ecosystem.md in the main repository and sync.\n`);
  process.exit(1);
}

console.log(`[family-block] ${files} 个 README、${regions} 个标记区，戳全部相符 ✓`);
