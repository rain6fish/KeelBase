#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 跨仓语料单源检查（CE-1「载体可替换」）：主仓 `specs/protocol/*-vector.json` ↔ Java 仓
 * `conformance/vectors/` 的 vendored 快照。
 *
 * **为什么需要**：Java 仓（KeelBase4J）以主仓语料自证 conformance（G0 42/42），但其快照是**只读副本**
 * （`conformance/vectors/README.md: vendored snapshot`）——主仓语料一变，Java 快照即陈旧，**两侧 CI 都看不见对方**，
 * 无机制会红（单源纪律在跨仓失守）。
 *
 * 判据：
 *   1. **共同向量逐字节相等**（漂移即失败）——任一内容差异（含今天的 canonical-json 用例/algorithm 串变更）都拦。
 *   2. **主仓独有向量**（Java 快照缺）→ 报告为**覆盖缺口**（退出码 1，可 `--allow-missing` 降级为警告）。
 *
 * 用法（需两仓同机；本检查**不进 CI**——CI 只见单仓）：
 *   node scripts/check-java-vector-sync.mjs [--java <javaRepoDir>] [--allow-missing] [--sync]
 *   默认 Java 仓：../KeelBase4J（或环境变量 KEELBASE_JAVA_REPO）
 *   --sync：把主仓向量**复制**到 Java 快照（仅在确认后手动跑；改的是另一个仓）
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
const ALLOW_MISSING = argv.includes('--allow-missing');
const SYNC = argv.includes('--sync');

if (!existsSync(JAVA_DIR)) {
  console.error(`✗ Java 快照目录不存在：${JAVA_DIR}`);
  console.error('  用 --java <dir> 或 KEELBASE_JAVA_REPO 指定 Java 仓根（本检查需两仓同机；不在 CI 跑）。');
  process.exit(2);
}

const vectors = (dir) => readdirSync(dir).filter((f) => /-vector\.json$/.test(f)).sort();
const mainFiles = vectors(MAIN_DIR);
const javaFiles = vectors(JAVA_DIR);

const read = (dir, f) => readFileSync(join(dir, f), 'utf8');

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

console.log('═══ 跨仓语料单源检查（主仓 specs/protocol ↔ Java conformance/vectors）═══');
console.log(`  主仓向量：${mainFiles.length} 份 · Java 快照：${javaFiles.length} 份`);

if (SYNC) {
  console.log(`  ↻ --sync：已同步 ${syncedCount} 份到 ${JAVA_DIR}`);
}

if (extra.length) console.log(`  ⚠ Java 侧独有（主仓无，未纳入判据）：${extra.join(', ')}`);
if (drift.length) console.log(`  ✗ 内容漂移（共同向量逐字节不等）：${drift.join(', ')}`);
if (missing.length) console.log(`  ${ALLOW_MISSING ? '⚠' : '✗'} 主仓独有（Java 快照缺）：${missing.join(', ')}`);

const failed = drift.length > 0 || (missing.length > 0 && !ALLOW_MISSING);
if (failed) {
  console.error('\n✗ 跨仓漂移未通过——Java 快照已落后主仓语料。');
  console.error('  修正：`node scripts/check-java-vector-sync.mjs --sync`（在 KeelBase4J 侧重新跑 conformance）。');
  process.exit(1);
}
console.log('\n✓ 跨仓语料一致' + (missing.length ? `（${missing.length} 份主仓独有，已按 --allow-missing 放行）` : ''));
