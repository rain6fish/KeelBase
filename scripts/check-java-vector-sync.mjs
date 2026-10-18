#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Cross-repository corpus single-source check (CE-1, "the carrier is replaceable"): this repository's
 * `specs/protocol/*-vector.json` and `specs/protocol/schemas/**` against the Java repository's vendored
 * snapshot in `conformance/vectors/`.
 *
 * Why it is needed: the Java repository (KeelBase4J) proves its conformance (G0 42/42) against this
 * corpus, but its copy is read-only (`conformance/vectors/README.md: vendored snapshot`). When the
 * corpus moves here the Java snapshot goes stale, and the two repositories' CIs cannot see each other,
 * so nothing said so — single-source discipline lost across the repository boundary.
 *
 * It runs in CI now: the `java-vector-drift` job in `.github/workflows/ci.yml` checks KeelBase4J out
 * onto the same runner and runs this script against it, so the drift surfaces on its own instead of
 * when somebody remembers to run it — which is what P1-13 asks for. Running it by hand still works
 * when both checkouts sit side by side.
 *
 * Criterion:
 *   1. Common vectors are byte-compared after line-ending normalisation (drift fails) — any content
 *      difference is caught, including a changed canonical-json case or algorithm string; an
 *      end-of-line difference is not drift (see the note on `normalizeEol` below).
 *   2. A vector present here that the Java snapshot lacks is reported as a coverage gap (exit 1;
 *      `--allow-missing` downgrades it to a warning).
 *   3. `specs/protocol/schemas/**` is compared with the Java snapshot's `schemas/**` as a **set and by
 *      parsed content**, not by bytes: a file on one side only, a changed key or a changed `required`
 *      list is drift. Parsing absorbs CRLF/BOM/indentation; key order is still compared, because this
 *      directory is a vendored mirror rather than an equivalent document.
 *   4. `evidence-package` `/4` is asserted explicitly: the branch's `required` must list `coverage`, and
 *      `definitions.coverage` must still require `verdict` and `gaps`. Three copies deleting it together
 *      would pass criterion 3; this one fails on the content itself.
 *
 * 跨仓语料单源检查（CE-1「载体可替换」）：主仓 `specs/protocol/*-vector.json` 与
 * `specs/protocol/schemas/**` ↔ Java 仓 `conformance/vectors/` 的 vendored 快照。
 *
 * **为什么需要**：Java 仓（KeelBase4J）以主仓语料自证 conformance（G0 42/42），但其快照是**只读副本**
 * （`conformance/vectors/README.md: vendored snapshot`）——主仓语料一变，Java 快照即陈旧，而**两仓 CI
 * 互相看不见对方**，无机制会红（单源纪律在跨仓失守）。
 *
 * **它现在在 CI 里跑**：`.github/workflows/ci.yml` 的 `java-vector-drift` job 把 KeelBase4J 检出到同一个
 * runner 上、对着它跑本脚本 —— 于是漂移自己冒出来，而不是等谁记得跑（这正是 `P1-13` 要的）。两仓检出
 * 并排在本机时，手动跑仍然可用。
 *
 * 判据：
 *   1. **共同向量按行尾归一后逐字节相等**（漂移即失败）——任一内容差异（含 canonical-json 用例/algorithm 串变更）都拦；
 *      行尾差异不算漂移（见下方 `normalizeEol` 的成因说明）。
 *   2. **主仓独有向量**（Java 快照缺）→ 报告为**覆盖缺口**（退出码 1，可 `--allow-missing` 降级为警告）。
 *   3. `specs/protocol/schemas/**` 与 Java 快照的 `schemas/**` **比集合、也比解析后的内容**（不比字节）：
 *      一侧独有的文件、改过的键、改过的 `required` 清单都算漂移。解析顺带吃掉 CRLF / BOM / 缩进；键序仍参与
 *      比较 —— 这个目录是 vendored 镜像，不是「等价文档」。
 *   4. 对 `evidence-package` `/4` 单独断言：该分支的 `required` 必须含 `coverage`，且 `definitions.coverage`
 *      仍要求 `verdict` 与 `gaps`。三处副本一起删掉能通过判据 3，但过不了这一条 —— 它看的是内容本身。
 *
 * 用法：
 *   node scripts/check-java-vector-sync.mjs [--java <javaRepoDir>] [--allow-missing] [--sync]
 *   默认 Java 仓：../KeelBase4J（或环境变量 KEELBASE_JAVA_REPO）；CI 里传 `--java java-repo`。
 *   --sync：把主仓向量与 schema **复制**到 Java 快照（仅在确认后手动跑；改的是另一个仓；写入按 LF 归一）
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const MAIN_DIR = join(ROOT, 'Server-NestJS/specs/protocol');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const JAVA_REPO = resolve(ROOT, arg('--java', process.env.KEELBASE_JAVA_REPO ?? '../KeelBase4J'));
const JAVA_DIR = join(JAVA_REPO, 'conformance/vectors');
const MAIN_SCHEMAS_DIR = join(MAIN_DIR, 'schemas');
const JAVA_SCHEMAS_DIR = join(JAVA_DIR, 'schemas');
const ALLOW_MISSING = argv.includes('--allow-missing');
const SYNC = argv.includes('--sync');

if (!existsSync(JAVA_DIR)) {
  console.error(`✗ Java 快照目录不存在：${JAVA_DIR}`);
  console.error('  用 --java <dir> 或 KEELBASE_JAVA_REPO 指定 Java 仓根（本检查需两仓同机；CI 的 java-vector-drift job 会检出两仓来跑）。');
  process.exit(2);
}

// Fail loud rather than reporting an empty set: a missing schema directory is a broken checkout, not
// "zero schemas agree". 缺目录直接报错，不当作「零份 schema 一致」。
for (const [label, dir] of [
  ['主仓 schema 目录', MAIN_SCHEMAS_DIR],
  ['Java schema 快照目录', JAVA_SCHEMAS_DIR],
]) {
  if (!existsSync(dir)) {
    console.error(`✗ ${label}不存在：${dir}`);
    console.error('  本检查要求两侧 checkout 完整；缺目录时 fail-loud，不静默跳过 schema 比对。');
    process.exit(2);
  }
}

const vectors = (dir) => readdirSync(dir).filter((f) => /-vector\.json$/.test(f)).sort();
const mainFiles = vectors(MAIN_DIR);
const javaFiles = vectors(JAVA_DIR);

/**
 * 行尾归一（CRLF → LF）后再比 / 再写。
 *
 * **为什么必须归一**：本机 `core.autocrlf` 会把工作区置成 CRLF，而 Java 仓（`.gitattributes: *.json text eol=lf`）
 * 是 LF —— 直接逐字节比会在 Windows 上**把行尾差异误报成内容漂移**（2026-09-17 实测：7/7 全假红），
 * 且 `--sync` 会把本机 CRLF **写进另一个仓**、制造全文件 diff。归一后，比较与写入都与平台无关。
 * （与 `protocol:vectors:check` 在本机假红同根；那边另有其修法。）
 */
const normalizeEol = (s) => s.replace(/\r\n/g, '\n');
const read = (dir, f) => normalizeEol(readFileSync(join(dir, f), 'utf8'));

const drift = [];
const missing = [];
let syncedCount = 0;

for (const f of mainFiles) {
  if (!javaFiles.includes(f)) {
    missing.push(f);
    if (SYNC) {
      writeFileSync(join(JAVA_DIR, f), read(MAIN_DIR, f));
      syncedCount++;
    }
    continue;
  }
  const a = read(MAIN_DIR, f);
  const b = read(JAVA_DIR, f);
  if (a !== b) {
    drift.push(f);
    if (SYNC) {
      writeFileSync(join(JAVA_DIR, f), a);
      syncedCount++;
    }
  }
}

const extra = javaFiles.filter((f) => !mainFiles.includes(f));

// ── schema：同集 + 同内容 ──────────────────────────────────────────────────────
// Both trees are walked with relative paths so the comparison is by location, not by file name.
// 两侧按相对路径枚举，按位置比对，不按文件名猜。
const walkFiles = (dir, rel = '') => {
  const out = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(dir, r));
    else if (entry.isFile()) out.push(r);
  }
  return out.sort();
};

let mainSchemas;
let javaSchemas;
try {
  mainSchemas = walkFiles(MAIN_SCHEMAS_DIR);
  javaSchemas = walkFiles(JAVA_SCHEMAS_DIR);
} catch (e) {
  console.error(`✗ 枚举 schema 目录失败 —— ${e.message}`);
  process.exit(2);
}

const schemaMissing = mainSchemas.filter((f) => !javaSchemas.includes(f));
const schemaExtra = javaSchemas.filter((f) => !mainSchemas.includes(f));
const schemaProblems = [];
let schemaSynced = 0;

const readJson = (abs) => JSON.parse(readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));

/**
 * Describe the first structural difference, for the failure line. Object key order alone is not a
 * value difference here — it is reported separately as "key order" so the operator still sees it.
 * 给出第一处结构差异的可读位置；只差键序时返回 null，由调用方另写「键序不同」。
 */
const describeDiff = (a, b, at = '$') => {
  if (a === b) return null;
  const arrA = Array.isArray(a);
  const arrB = Array.isArray(b);
  if (arrA && arrB) {
    if (a.length !== b.length) return `${at}（数组长度 ${a.length} ≠ ${b.length}）`;
    for (let i = 0; i < a.length; i++) {
      const d = describeDiff(a[i], b[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !arrA && !arrB) {
    for (const k of Object.keys(a)) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return `${at}.${k}（主仓有、Java 缺）`;
    }
    for (const k of Object.keys(b)) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) return `${at}.${k}（Java 有、主仓缺）`;
    }
    for (const k of Object.keys(a)) {
      const d = describeDiff(a[k], b[k], `${at}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return `${at}（${JSON.stringify(a)} ≠ ${JSON.stringify(b)}）`;
};

for (const f of mainSchemas) {
  const mainAbs = join(MAIN_SCHEMAS_DIR, f);
  const javaAbs = join(JAVA_SCHEMAS_DIR, f);
  const syncToJava = () => {
    mkdirSync(dirname(javaAbs), { recursive: true });
    writeFileSync(javaAbs, normalizeEol(readFileSync(mainAbs, 'utf8')));
    schemaSynced++;
  };

  if (schemaMissing.includes(f)) {
    if (SYNC) syncToJava();
    continue;
  }

  if (!f.endsWith('.json')) {
    const a = normalizeEol(readFileSync(mainAbs, 'utf8'));
    const b = normalizeEol(readFileSync(javaAbs, 'utf8'));
    if (a !== b) {
      schemaProblems.push(`${f}（非 JSON 文件逐字节不同）`);
      if (SYNC) syncToJava();
    }
    continue;
  }

  let a;
  let b;
  try {
    a = readJson(mainAbs);
  } catch (e) {
    console.error(`✗ 主仓 schema 不是合法 JSON：${f} —— ${e.message}`);
    process.exit(2);
  }
  try {
    b = readJson(javaAbs);
  } catch (e) {
    console.error(`✗ Java 快照 schema 不是合法 JSON：${f} —— ${e.message}`);
    process.exit(2);
  }

  // JSON.stringify on the parsed values preserves key order, so a reordered key still registers as
  // drift (this is a mirror, not an equivalent document); parsing removes CRLF/BOM/indentation noise.
  // 对解析后的值做 JSON.stringify：键序保留（镜像目录，键序变了也算漂移），而行尾/BOM/缩进噪声已被解析吃掉。
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    schemaProblems.push(`${f}（${describeDiff(a, b) ?? '键序不同（解析后内容相同）'}）`);
    if (SYNC) syncToJava();
  }
}

/**
 * Explicit `/4` assertion: content equality alone would let all copies delete `coverage` together.
 * 显式断言 `/4`：仅靠内容相等，三处副本一起删掉 `coverage` 也会放行。
 */
const EP_SCHEMA = 'v6/evidence-package.schema.json';
const assertEvidencePackageV4 = (side, abs) => {
  let schema;
  try {
    schema = readJson(abs);
  } catch (e) {
    return `${side} ${EP_SCHEMA} 不是合法 JSON —— ${e.message}`;
  }
  const branch = (schema.oneOf ?? []).find(
    (v) => v?.properties?.format?.const === 'keelbase-audit-evidence/4',
  );
  if (!branch) return `${side} ${EP_SCHEMA}：找不到 format = keelbase-audit-evidence/4 的分支`;
  const required = branch.required ?? [];
  if (!required.includes('coverage')) {
    return `${side} ${EP_SCHEMA}：/4 分支的 required 缺 coverage`;
  }
  if (branch.properties?.coverage?.$ref !== '#/definitions/coverage') {
    return `${side} ${EP_SCHEMA}：/4 的 coverage 未指向 #/definitions/coverage`;
  }
  const covReq = schema.definitions?.coverage?.required ?? [];
  for (const k of ['verdict', 'gaps']) {
    if (!covReq.includes(k)) return `${side} ${EP_SCHEMA}：definitions.coverage.required 缺 ${k}`;
  }
  return null;
};

for (const [side, dir] of [
  ['主仓', MAIN_SCHEMAS_DIR],
  ['Java 快照', JAVA_SCHEMAS_DIR],
]) {
  const abs = join(dir, EP_SCHEMA);
  if (!existsSync(abs)) {
    if (side === '主仓') schemaProblems.push(`主仓 ${EP_SCHEMA}：文件不存在`);
    continue; // Java 侧缺文件已由集合比对报出
  }
  const problem = assertEvidencePackageV4(side, abs);
  if (problem) schemaProblems.push(problem);
}

console.log('═══ 跨仓语料单源检查（主仓 specs/protocol ↔ Java conformance/vectors）═══');
console.log(`  主仓向量：${mainFiles.length} 份 · Java 快照：${javaFiles.length} 份`);

if (SYNC) {
  console.log(`  ↻ --sync：已同步 ${syncedCount} 份到 ${JAVA_DIR}`);
}

if (extra.length) console.log(`  ⚠ Java 侧独有（主仓无，未纳入判据）：${extra.join(', ')}`);
if (drift.length) console.log(`  ✗ 内容漂移（共同向量逐字节不等）：${drift.join(', ')}`);
if (missing.length) console.log(`  ${ALLOW_MISSING ? '⚠' : '✗'} 主仓独有（Java 快照缺）：${missing.join(', ')}`);

console.log('\n═══ 跨仓 schema 单源检查（主仓 specs/protocol/schemas ↔ Java conformance/vectors/schemas）═══');
console.log(`  主仓 schema：${mainSchemas.length} 份 · Java 快照：${javaSchemas.length} 份`);
if (SYNC) console.log(`  ↻ --sync：已同步 ${schemaSynced} 份 schema 到 ${JAVA_SCHEMAS_DIR}`);
if (schemaExtra.length) console.log(`  ✗ Java 侧独有（主仓无）：${schemaExtra.join(', ')}`);
if (schemaMissing.length) console.log(`  ${ALLOW_MISSING ? '⚠' : '✗'} 主仓独有（Java 快照缺）：${schemaMissing.join(', ')}`);
if (schemaProblems.length) {
  console.log(`  ✗ schema 内容漂移（${schemaProblems.length} 处）：`);
  for (const p of schemaProblems) console.log(`    - ${p}`);
}

const failed =
  drift.length > 0 ||
  (missing.length > 0 && !ALLOW_MISSING) ||
  schemaExtra.length > 0 ||
  schemaProblems.length > 0 ||
  (schemaMissing.length > 0 && !ALLOW_MISSING);
if (failed) {
  console.error('\n✗ 跨仓漂移未通过——Java 快照已落后主仓语料。');
  console.error('  修正：`node scripts/check-java-vector-sync.mjs --sync`（在 KeelBase4J 侧重新跑 conformance）。');
  process.exit(1);
}
const allowNotes = [];
if (missing.length) allowNotes.push(`向量 ${missing.length} 份主仓独有`);
if (schemaMissing.length) allowNotes.push(`schema ${schemaMissing.length} 份主仓独有`);
console.log('\n✓ 跨仓语料一致（向量 + schema）' + (allowNotes.length ? `（${allowNotes.join('，')}，已按 --allow-missing 放行）` : ''));
