#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The "KeelBase family" section is written once and appears in several repositories' READMEs.
 *
 * Until now each README carried its own hand-written list of sibling repositories, and they drifted
 * the way hand-written copies do: the main README and KeelBase4J's both listed four repositories and
 * both omitted the host adapters; and KeelBase4J's copy of the compatibility table said
 * `main → contract v1.2.0` while the main repository — whose copy is gated against the submodule pin
 * by `check-contract-matrix.mjs` — said `v1.8.0`. The ungated copy is the one that drifted.
 *
 * So the section now has one source, `docs/ecosystem.md`, and this script is the only thing that
 * writes it into a README. Each generated region carries a `sha256:` stamp of its own body on the
 * BEGIN line: because the stamp lives in the marker and the body comes from the source, every copy
 * is byte-identical, so a repository can verify its own copy with no sibling checkout and no network.
 *
 * `--check` verifies instead of writing. A sibling repository that is not checked out is reported as
 * skipped, never as a failure — CI checks out one repository, not the family.
 *
 * 「KeelBase 家族」这一段写一次、出现在多个仓的 README 里。
 *
 * 在此之前每个 README 都自带一份手写的兄弟仓列表，而手抄的副本就会漂：主仓与 KeelBase4J 的两份都只列了
 * 四个仓、都漏了宿主适配仓；而 KeelBase4J 那份兼容矩阵写的是 `main → contract v1.2.0`，主仓那份
 * ——由 `check-contract-matrix.mjs` 对着子模块 pin 看住——写的是 `v1.8.0`。**漂的正是没门禁的那份。**
 *
 * 所以这一段现在有唯一来源 `docs/ecosystem.md`，本脚本是唯一把它写进 README 的东西。每个生成区在
 * BEGIN 行带一个自身内容的 `sha256:` 戳：戳在标记行、内容来自源，故所有副本逐字节一致，于是各仓
 * **无需兄弟检出、无需联网**即可自检。
 *
 * `--check` 只校验不写。未检出的兄弟仓如实报 skipped、不算失败——CI 只检出本仓，不检出整个家族。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'docs', 'ecosystem.md');
const CHECK = process.argv.includes('--check');

const REGIONS = ['en', 'zh'];

/** Where each region goes. A target without `removeSection` inserts before `anchor`.  各区落点。 */
const TARGETS = [
  {
    dir: ROOT,
    file: 'README.md',
    regions: ['en'],
    anchor: '## 🧭 Compatibility',
    removeSection: '## 🔗 Repositories',
  },
  {
    dir: ROOT,
    file: 'README.zh-CN.md',
    regions: ['zh'],
    anchor: '## 🧭 兼容矩阵',
    removeSection: '## 🔗 仓库',
  },
  {
    dir: path.resolve(ROOT, '..', 'keelbase-contract'),
    file: 'README.md',
    regions: ['en', 'zh'],
    anchor: '## 目录 / Layout',
  },
  { dir: path.resolve(ROOT, '..', 'KeelBase4J'), file: 'README.md', regions: ['en'], anchor: '## What this is' },
  { dir: path.resolve(ROOT, '..', 'KeelBase4J'), file: 'README.zh-CN.md', regions: ['zh'], anchor: '## 这是什么' },
  { dir: path.resolve(ROOT, '..', 'KeelBase-YuDao'), file: 'README.md', regions: ['en'], anchor: '## What this is' },
  { dir: path.resolve(ROOT, '..', 'KeelBase-YuDao'), file: 'README.zh-CN.md', regions: ['zh'], anchor: '## 这是什么' },
  {
    dir: path.resolve(ROOT, '..', 'KeelBase-java-starter'),
    file: 'README.md',
    regions: ['en'],
    anchor: '## Try it — integrators welcome / 试用征集（0.1.7）',
  },
  {
    dir: path.resolve(ROOT, '..', 'KeelBase-java-starter'),
    file: 'README.zh-CN.md',
    regions: ['zh'],
    anchor: '## 试用征集（0.1.7）',
  },
];

/**
 * The self-check script is a generated artifact too: one identical copy per repository, so that each
 * can verify its own block without the others.  自检脚本也是生成物：每仓一份完全相同的副本。
 */
const MIRRORS = [
  { dir: path.resolve(ROOT, '..', 'keelbase-contract'), file: 'runner/check-family-block.mjs' },
  { dir: path.resolve(ROOT, '..', 'KeelBase4J'), file: 'scripts/check-family-block.mjs' },
  { dir: path.resolve(ROOT, '..', 'KeelBase-YuDao'), file: 'scripts/check-family-block.mjs' },
  { dir: path.resolve(ROOT, '..', 'KeelBase-java-starter'), file: 'scripts/check-family-block.mjs' },
];

const lf = (s) => s.replace(/\r\n/g, '\n');
const hashOf = (body) => crypto.createHash('sha256').update(body, 'utf8').digest('hex');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const beginRe = (region) =>
  new RegExp(`<!-- BEGIN keelbase-family:${region}(?:\\s+sha256:[0-9a-f]{64})? -->`);
const endMarker = (region) => `<!-- END keelbase-family:${region} -->`;
const blockRe = (region) =>
  new RegExp(`${beginRe(region).source}\\n[\\s\\S]*?\\n${escapeRe(endMarker(region))}`);

/** Read as LF-normalised text, remembering the file's own line ending.  按 LF 归一读入并记住原行尾。 */
function readText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { text: lf(raw), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}

function writeText(file, text, eol) {
  fs.writeFileSync(file, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

/** The body of a marked region in the source, without its marker lines.  源文件里某标记区的内容。 */
function sourceBody(srcText, region) {
  const m = srcText.match(new RegExp(`${beginRe(region).source}\\n([\\s\\S]*?)\\n${escapeRe(endMarker(region))}`));
  if (!m) throw new Error(`docs/ecosystem.md 缺标记区 :${region} / no :${region} region in docs/ecosystem.md`);
  return m[1];
}

/** A region as it is written into a README: marker lines plus stamped body.  一个区写进 README 的最终形态。 */
function render(region, body) {
  return `${beginRe(region).source.replace('(?:\\s+sha256:[0-9a-f]{64})?', ` sha256:${hashOf(body)}`)}\n${body}\n${endMarker(region)}`;
}

/** Insert the whole block before `anchor`, dropping `removeSection` first if one is named.  首次插入。 */
function insertInitial(text, block, target) {
  const lines = text.split('\n');
  const at = (needle) => lines.findIndex((l) => l.trim() === needle);
  const anchorIdx = at(target.anchor);
  if (anchorIdx === -1) throw new Error(`找不到锚点 / anchor not found: ${target.anchor}`);
  let from = anchorIdx;
  if (target.removeSection) {
    const cut = at(target.removeSection);
    if (cut === -1) throw new Error(`找不到待删小节 / section not found: ${target.removeSection}`);
    from = cut;
  }
  const head = lines.slice(0, from).join('\n').replace(/\n+$/, '');
  const tail = lines.slice(anchorIdx).join('\n');
  return `${head}\n\n${block}\n\n${tail}`;
}

const source = readText(SOURCE);
const bodies = Object.fromEntries(REGIONS.map((r) => [r, sourceBody(source.text, r)]));
const rendered = Object.fromEntries(REGIONS.map((r) => [r, render(r, bodies[r])]));

const failures = [];
const notes = [];
let written = 0;

// The source's own markers must carry the current stamps too, or the source is the one file that lies.
// 源文件自己的标记行也要带上当前戳，否则唯一说谎的就是源文件本身。
let sourceText = source.text;
let sourceTouched = false;
for (const region of REGIONS) {
  if (!blockRe(region).test(sourceText)) {
    failures.push(`docs/ecosystem.md：:${region} 标记区不完整`);
    continue;
  }
  const next = sourceText.replace(blockRe(region), rendered[region]);
  if (next !== sourceText) {
    if (CHECK) {
      failures.push(`docs/ecosystem.md：:${region} 的戳与内容不符`);
    } else {
      sourceText = next;
      sourceTouched = true;
    }
  }
}
if (sourceTouched) {
  writeText(SOURCE, sourceText, source.eol);
  written += 1;
  notes.push('docs/ecosystem.md：戳已刷新 ✓');
}

for (const target of TARGETS) {
  const file = path.join(target.dir, target.file);
  const shown = path.relative(ROOT, file).replace(/\\/g, '/');

  if (!fs.existsSync(file)) {
    notes.push(`${shown}：兄弟仓未检出，跳过 / sibling not checked out, skipped`);
    continue;
  }

  const { text, eol } = readText(file);
  const block = target.regions.map((r) => rendered[r]).join('\n\n');
  const present = target.regions.every((r) => blockRe(r).test(text));
  let next;

  if (present) {
    next = text;
    for (const region of target.regions) next = next.replace(blockRe(region), rendered[region]);
  } else if (CHECK) {
    failures.push(`${shown}：缺标记区（需先跑同步） / marked regions missing (sync first)`);
    continue;
  } else {
    next = insertInitial(text, block, target);
  }

  if (next === text) {
    notes.push(`${shown}：已是最新 ✓`);
    continue;
  }
  if (CHECK) {
    failures.push(`${shown}：与 docs/ecosystem.md 不一致 / differs from the source`);
    continue;
  }
  writeText(file, next, eol);
  written += 1;
  notes.push(`${shown}：已同步 ✓`);
}

const scriptText = fs.readFileSync(path.join(ROOT, 'scripts', 'check-family-block.mjs'), 'utf8');
for (const mirror of MIRRORS) {
  const dest = path.join(mirror.dir, mirror.file);
  const shown = path.relative(ROOT, dest).replace(/\\/g, '/');

  if (!fs.existsSync(mirror.dir)) {
    notes.push(`${shown}：兄弟仓未检出，跳过 / sibling not checked out, skipped`);
    continue;
  }
  if (fs.existsSync(dest) && lf(fs.readFileSync(dest, 'utf8')) === lf(scriptText)) {
    notes.push(`${shown}：副本一致 ✓`);
    continue;
  }
  if (CHECK) {
    failures.push(`${shown}：与主仓 scripts/check-family-block.mjs 不一致 / differs from the canonical copy`);
    continue;
  }
  fs.writeFileSync(dest, scriptText, 'utf8');
  written += 1;
  notes.push(`${shown}：副本已写入 ✓`);
}

for (const n of notes) console.log(`[family-block] ${n}`);
if (failures.length > 0) {
  console.error(`\n[family-block] ${failures.length} 处 / ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n改 docs/ecosystem.md，再跑 node scripts/sync-family-block.mjs。`);
  console.error(`Edit docs/ecosystem.md, then run the sync script.\n`);
  process.exit(1);
}
console.log(
  CHECK
    ? `[family-block] ${REGIONS.length} 个区与各 README 一致 ✓`
    : `[family-block] 已写 ${written} 处 ✓`,
);
