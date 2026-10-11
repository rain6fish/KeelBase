#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The two READMEs are mirrors, so they must link the same things — and every link must resolve.
 *
 * The English README quietly grew entries the Chinese one never got: by 2026-10-11 it had 54 relative
 * links against 43, among them the whole "KeelBase DNA" paragraph and the links to concepts, the rules
 * map, product language, compliance mapping and the versioning plan. A reader of either language should
 * be able to reach the same documents. Nothing compared them, so the shorter one stayed short.
 *
 * Both directions are checked: a link only one README has is the drift, whichever side it is on.
 *
 * 两版 README 是镜像，故必须链同样的东西 —— 且每条链接都要能解析。
 *
 * 英文版悄悄长出了中文版从没有的条目：到 2026-10-11 它有 54 条相对链接、中文版 43 条，差的里面包括整段
 * 「KeelBase DNA」以及概念地图、规则地图、产品语言、合规映射、版本策略这几条链接。读任一语言的读者都应能
 * 到达同一批文档。没有东西比对它们，所以短的那版一直短着。
 *
 * 两个方向都查：只有一版有的链接就是漂移，无论在哪一侧。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READMES = ['README.md', 'README.zh-CN.md'];

/** Relative link targets in a README: `](…)`, minus anchors, minus absolute URLs.  某版 README 里的相对链接目标。 */
const linksIn = (file) =>
  [
    ...new Set(
      [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)]
        .map((m) => m[1].split('#')[0])
        .filter((t) => t && !/^[a-z][a-z0-9+.-]*:/i.test(t)),
    ),
  ].sort();

const [en, zh] = READMES.map(linksIn);
const failures = [];

for (const l of en) if (!zh.includes(l)) failures.push(`${READMES[0]} 有、${READMES[1]} 无：${l}`);
for (const l of zh) if (!en.includes(l)) failures.push(`${READMES[1]} 有、${READMES[0]} 无：${l}`);

// Resolution: a link is only useful if it lands somewhere.  解析：链接得能落到实处。
for (const [file, links] of READMES.map((f) => [f, linksIn(f)])) {
  for (const l of links) {
    if (!fs.existsSync(path.join(ROOT, l))) failures.push(`${file}：链接指向不存在的路径 ${l}`);
  }
}

if (failures.length > 0) {
  console.error(`\n[readme-parity] ${failures.length} 处：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n两版要对齐，且每条都要解析。\nBoth READMEs must list the same links, and every link must resolve.\n`);
  process.exit(1);
}
console.log(`[readme-parity] 两版各 ${en.length} 条相对链接、集合一致、且全部解析 ✓`);
