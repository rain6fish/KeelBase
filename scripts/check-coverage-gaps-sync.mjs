#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-repository coverage-gap single-source check.
 *
 * The gap registry is minted in one place — `Server-NestJS/src/governance-core/coverage-gaps.ts` — because a
 * gap id has to mean the same thing whichever runtime emitted the package. The Java runtime cannot
 * read TypeScript, so it keeps a vendored copy, and a copy nobody compares is a copy that goes stale
 * silently. This is the comparison.
 *
 * It is deliberately a **content** comparison, not a byte one: both sides are parsed and re-serialised
 * canonically, so an end-of-line or indentation difference is not drift while a changed statement,
 * severity or predicate is. The vectors next door are byte-compared because their exact bytes are
 * hashed; these bytes are not.
 *
 * The main side is **parsed out of the TypeScript source** rather than imported, for the same reason
 * `check-tool-label-parity.mjs` parses: the module cannot be loaded from a plain `.mjs` (the project's
 * `tsconfig` is `NodeNext`, which `ts-node` refuses to override), and a second checked-in copy of the
 * registry would be exactly the drift this gate exists to catch. The parser fails **closed** — a
 * field it cannot find is an error, never a silently smaller table.
 *
 * Criterion:
 *   1. Same ids on both sides; same content per id (drift fails).
 *   2. An id present here that the Java copy lacks is a coverage gap (exit 1; `--allow-missing`
 *      downgrades it to a warning).
 *
 * 跨仓缺口登记表单源检查。
 *
 * 缺口 id 只在一处铸造 —— `Server-NestJS/src/governance-core/coverage-gaps.ts` —— 因为同一个 id 无论由哪个
 * 运行时发出，含义必须相同。Java 运行时读不了 TypeScript，故留一份 vendored 副本；而**没人比对的副本
 * 就是一份会静默陈旧的副本**。这就是那个比对。
 *
 * 它**刻意比内容、不比字节**：两边都解析后按规范重新序列化，于是行尾 / 缩进差异不算漂移，而改过的
 * 陈述、严重度或谓词算。旁边的向量走逐字节是因为它们的字节要进哈希；这些字节不进。
 *
 * 主仓那一侧是**从 TypeScript 源码里解析**出来的，不是 import 的 —— 与 `check-tool-label-parity.mjs`
 * 同理：本模块无法从纯 `.mjs` 加载（本仓 `tsconfig` 是 `NodeNext`，`ts-node` 拒绝覆盖），而**再入库一份
 * 注册表**恰恰就是这道闸要抓的那种漂移。解析器**fail-closed** —— 找不到字段就报错，绝不悄悄少一条。
 *
 * 判据：
 *   1. 两边 id 相同、每个 id 内容相同（漂移即失败）。
 *   2. 主仓有、Java 副本缺 → 报告为**覆盖缺口**（退出码 1，可 `--allow-missing` 降级为警告）。
 *
 * 用法：
 *   node scripts/check-coverage-gaps-sync.mjs [--java <javaRepoDir>] [--allow-missing] [--sync]
 *   默认 Java 仓：../KeelBase4J（或环境变量 KEELBASE_JAVA_REPO）；CI 里传 `--java java-repo`。
 *   --sync：把主仓注册表写入 Java 快照（仅在确认后手动跑；改的是另一个仓；写入按 LF 归一）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SRC = 'Server-NestJS/src/governance-core/coverage-gaps.ts';
const SNAPSHOT = 'conformance/coverage-gaps.json';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const JAVA_REPO = resolve(ROOT, arg('--java', process.env.KEELBASE_JAVA_REPO ?? '../KeelBase4J'));
const JAVA_FILE = join(JAVA_REPO, SNAPSHOT);
const ALLOW_MISSING = argv.includes('--allow-missing');
const SYNC = argv.includes('--sync');

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(2);
};

// ── 主仓一侧：解析 TS 源码（fail-closed）─────────────────────────────────────────
const srcPath = join(ROOT, SRC);
if (!existsSync(srcPath)) die(`找不到 ${SRC}`);

const src = readFileSync(srcPath, 'utf8');
const start = src.indexOf('export const COVERAGE_GAPS');
if (start < 0) die(`${SRC} 里找不到 \`export const COVERAGE_GAPS\``);
const rest = src.slice(start);
const end = rest.indexOf('\n];');
if (end < 0) die(`${SRC} 的 COVERAGE_GAPS 数组没有以行首 \`];\` 收尾`);

const blocks = rest
  .slice(0, end)
  .split(/\n  \{\n/)
  .slice(1);
if (blocks.length === 0) die(`${SRC} 的 COVERAGE_GAPS 解析出 0 条 —— 数组形状变了？`);

const field = (block, re, name, id) => {
  const m = block.match(re);
  if (!m) die(`条目 ${id} 解析不到字段 \`${name}\``);
  return m[1];
};

const gaps = blocks.map((block, i) => {
  const idm = block.match(/id:\s*'([^']+)'/);
  if (!idm) die(`第 ${i + 1} 个条目解析不到 \`id\``);
  const id = idm[1];

  const appliesRaw = block.match(/appliesWhen:\s*\[([\s\S]*?)\]/);
  if (!appliesRaw) die(`条目 ${id} 解析不到 \`appliesWhen\``);
  const appliesWhen = [...appliesRaw[1].matchAll(
    /\{\s*fact:\s*'([^']+)',\s*equals:\s*(?:'([^']*)'|(true|false))\s*\}/g,
  )].map((m) => ({ fact: m[1], equals: m[3] === undefined ? m[2] : m[3] === 'true' }));

  if (/appliesWhen:\s*\[[\s\S]*?\]/.test(block) && appliesWhen.length === 0 && !/\[\s*\]/.test(appliesRaw[0])) {
    die(`条目 ${id} 的 \`appliesWhen\` 非空却解析出 0 个条件 —— 谓词形状变了？`);
  }

  return {
    id,
    severity: field(block, /severity:\s*'([^']+)'/, 'severity', id),
    affects: field(block, /affects:\s*'([^']+)'/, 'affects', id),
    verdictImpact: field(block, /verdictImpact:\s*'([^']+)'/, 'verdictImpact', id),
    appliesWhen,
    statement: field(block, /statement:\s*\n?\s*'([^']*)'/, 'statement', id),
    origin: field(block, /origin:\s*'([^']*)'/, 'origin', id),
  };
});

const canonical = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const mine = { gaps };

// ── 比对 ────────────────────────────────────────────────────────────────────────
if (!existsSync(JAVA_REPO)) {
  console.error(`✗ Java 检出不存在：${JAVA_REPO}`);
  console.error('  用 --java <dir> 或 KEELBASE_JAVA_REPO 指定 Java 仓根（本检查需两仓同机）。');
  process.exit(2);
}

if (SYNC) {
  mkdirSync(dirname(JAVA_FILE), { recursive: true });
  writeFileSync(JAVA_FILE, canonical(mine).replace(/\r\n/g, '\n'), 'utf8');
  console.log(`✓ 已把 ${gaps.length} 条缺口写入 Java 快照：${SNAPSHOT}`);
  console.log('  （改的是另一个仓 —— 提交前请先确认那是你要的。）');
  process.exit(0);
}

if (!existsSync(JAVA_FILE)) {
  const msg = `Java 快照缺这条文件：${SNAPSHOT}（主仓有 ${gaps.length} 条）`;
  if (ALLOW_MISSING) console.warn(`⚠ ${msg} —— --allow-missing，降级为警告`);
  else {
    console.error(`✗ ${msg}`);
    console.error('  补法：node scripts/check-coverage-gaps-sync.mjs --sync');
    process.exit(1);
  }
  process.exit(0);
}

let theirs;
try {
  theirs = JSON.parse(readFileSync(JAVA_FILE, 'utf8'));
} catch (e) {
  console.error(`✗ Java 快照不是合法 JSON：${SNAPSHOT} —— ${e.message}`);
  process.exit(1);
}
if (!theirs || !Array.isArray(theirs.gaps)) {
  console.error(`✗ Java 快照没有 \`gaps\` 数组：${SNAPSHOT}`);
  process.exit(1);
}

const byId = (list) => new Map(list.map((g) => [g.id, g]));
const mineById = byId(mine.gaps);
const theirsById = byId(theirs.gaps);

const problems = [];
for (const [id, gap] of mineById) {
  if (!theirsById.has(id)) problems.push(`  缺：${id}（主仓有，Java 快照没有）`);
  else if (canonical(gap) !== canonical(theirsById.get(id))) problems.push(`  异：${id}（内容漂移）`);
}
for (const id of theirsById.keys()) {
  if (!mineById.has(id)) problems.push(`  多：${id}（Java 快照有，主仓没有）`);
}

const missingOnly =
  problems.length > 0 &&
  problems.every((p) => p.trimStart().startsWith('缺：')) &&
  ALLOW_MISSING;

if (problems.length === 0) {
  console.log(`✓ 缺口登记表两侧一致（${mine.gaps.length} 条）`);
  process.exit(0);
}

if (missingOnly) {
  console.warn(`⚠ 缺口登记表：${problems.length} 条主仓有而 Java 快照缺 —— --allow-missing，降级为警告`);
  for (const p of problems) console.warn(p);
  process.exit(0);
}

console.error(`✗ 缺口登记表跨仓漂移（${problems.length} 处）：`);
for (const p of problems) console.error(p);
console.error('  对齐：node scripts/check-coverage-gaps-sync.mjs --sync（改的是另一个仓）');
process.exit(1);
