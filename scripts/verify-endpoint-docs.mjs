#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 发布前一致性核对（§7.4 #5）— 全仓文档 ↔ 端点核对。
 *
 * 把 CLAUDE.md §9「API 端点汇总」表声明的端点，与 Server-NestJS/src 下各 controller
 * 的实际路由逐一比对，报告两类漂移：
 *   ✗ 声明了但代码里没有（文档过期 / 路由被删）——FAIL，发布前必须处理
 *   △ 代码里有但文档没声明（文档缺漏 / 内部路由）——WARN，供补文档参考
 *
 * 零依赖、确定性（只读解析）。参数名归一（:id 与 :userId 视为同一段）。
 *
 * 用法：
 *   node scripts/verify-endpoint-docs.mjs          # 核对 + 退出码（0=无 FAIL）
 *   node scripts/verify-endpoint-docs.mjs --full   # 连 WARN 也详细打印
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GLOBAL_PREFIX = '/api/v1';

/** 参数名归一：:id 与 :userId 视为同一段（/users/:p）。 */
function normPath(p) {
  return String(p)
    .replace(/\?.*$/, '') // 去 query
    .replace(/:[a-zA-Z0-9_]+/g, ':p') // 参数名归一
    .replace(/\/+$/, '') // 去尾斜杠
    .replace(/^\//, ''); // 去首斜杠
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.controller.ts')) acc.push(p);
  }
  return acc;
}

/** 从 controller 文件提取实际路由集合。 */
function extractActualRoutes() {
  const routes = [];
  const files = walk(join(ROOT, 'Server-NestJS/src'));
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/@Controller\(/.test(src)) continue; // 无 @Controller 跳过
    // @Controller() / @Controller('x') / @Controller({ path: 'x', version: '1' })
    const ctrl = src.match(/@Controller\(([^)]*)\)/);
    const inner = ctrl ? ctrl[1] : '';
    const pm = inner.match(/path:\s*'([^']*)'/);
    const sm = inner.match(/^\s*'([^']*)'/);
    const prefix = ((pm && pm[1]) || (sm && sm[1]) || '').replace(/^\//, '');
    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|\))/g)) {
      const method = m[1].toUpperCase();
      const sub = (m[2] || '').replace(/^\//, '');
      const path = normPath([GLOBAL_PREFIX, prefix, sub].filter(Boolean).join('/'));
      routes.push({ method, path, file: relative(ROOT, file).replace(/\\/g, '/') });
    }
  }
  return routes;
}

/** 从 CLAUDE.md §9 表提取声明端点（| Method | Path | ... |）。 */
function extractDeclaredRoutes() {
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  const section = claude.split('## 9. API 端点汇总')[1] || claude;
  const declared = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*(\/api\/[^\s|]+)/);
    if (!m) continue;
    declared.push({ method: m[1], path: normPath(m[2]) });
  }
  return declared;
}

const argv = process.argv.slice(2);
const FULL = argv.includes('--full') || argv.includes('-f');

console.log('═══ 发布前一致性核对：文档 ↔ 端点 ═══');

const actual = extractActualRoutes();
const declared = extractDeclaredRoutes();
const actualByPath = new Map(actual.map((r) => [r.path, r]));

// ✗ 声明了但代码没有
const declaredPaths = new Set(declared.map((d) => d.path));
const missing = declared.filter((d) => !actualByPath.has(d.path));
// △ 代码里有但文档没声明
const undeclared = actual.filter((r) => !declaredPaths.has(r.path));

console.log(`\n实际路由：${actual.length} 条（${actual.length ? new Set(actual.map((r) => r.file.split('/')[2] || '')).size : 0} 个模块）`);
console.log(`CLAUDE.md §9 声明：${declared.length} 条\n`);

if (missing.length === 0) {
  console.log(`✓ 声明端点全部在代码中（${declared.length}/${declared.length}）`);
} else {
  console.log(`✗ ${missing.length} 条声明端点代码中不存在（文档过期 / 路由被删）：`);
  for (const d of missing) console.log(`   ✗ ${d.method} ${d.path}`);
}

if (undeclared.length > 0 && (FULL || undeclared.length <= 40)) {
  console.log(`\n△ ${undeclared.length} 条代码路由文档未声明（文档缺漏 / 内部/管理路由）：`);
  for (const r of undeclared) console.log(`   △ ${r.method} ${r.path}  (${r.file})`);
} else if (undeclared.length > 40) {
  console.log(`\n△ ${undeclared.length} 条代码路由文档未声明（用 --full 看全部；以下前 40 条）：`);
  for (const r of undeclared.slice(0, 40)) console.log(`   △ ${r.method} ${r.path}  (${r.file})`);
}

const verdict = missing.length === 0 ? 'PASS' : 'FAIL';
console.log(`\n═══ 核对结果：${verdict}（${missing.length} 条声明缺失 / ${undeclared.length} 条未声明）═══`);
process.exitCode = missing.length === 0 ? 0 : 1;
