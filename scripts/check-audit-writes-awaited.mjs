#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 门禁：审计写入必须 `await` —— 除非有**写明的**理由不 await（ACT-11 第 ① 道）。
 *
 * ## 为什么要有这道门
 * 「工具执行了、审计没写」是本仓反复复发的同类缺陷（ACT-4 数出 12 处 fire-and-forget）。
 * 它此前靠人一遍遍 grep：`docs/*.md` 里的规矩说了要 await，但**没有机制**逼住。
 * 而这类缺陷**测试看不见**（用例不会让进程在写审计前崩），**静态规则一眼可见** —— 故它是门禁，
 * 不是测试。来源：roadmap §2.1.16 ACT-11；§2.1.11 的「未做」第三条（「此项应成为**例行动作**」）。
 *
 * ## 判据
 * `Server-NestJS/src/**`（排除 `*.spec.ts`）里每一处 `auditService.log(`：
 *   - 同一行有 `await` → 通过；
 *   - 没有 `await` → **必须**在其**前 5 行内**有内联标记 `audit-fire-and-forget:` 并附理由，
 *     否则本门禁失败。
 *
 * ## 为什么用内联标记而不是白名单
 * 白名单按「文件 + 行号/条数」记，重构一次就烂；内联标记把**理由写在代码旁边**，
 * 改这行的人看得见，且新增一处 fire-and-forget 必须显式写下理由（默认是必须 await）。
 *
 * ## 防真空通过
 * 全仓 `auditService.log(` 的**总数**低于 MIN_SITES 即判失败 —— 解析正则或写法变了会让扫描
 * 「零命中」，那与「全都 await 了」同形（本仓对「没发生」与「没看见」同形的忌惮见 F-10d）。
 *
 * 用法：node scripts/check-audit-writes-awaited.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, 'Server-NestJS', 'src');
/** 全仓审计写点数下限：低到不会因删代码误报，高到能识破「零命中」 */
const MIN_SITES = 10;
const MARKER = 'audit-fire-and-forget';
const LOOKBACK = 5;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

const errors = [];
let sites = 0;
let awaited = 0;
const marked = [];

for (const file of walk(SCAN_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('auditService.log(')) return;
    sites++;
    if (/\bawait\b/.test(line)) {
      awaited++;
      return;
    }
    // 未 await：向前找内联标记（标记写在调用上方的注释里）
    const from = Math.max(0, i - LOOKBACK);
    const hasMarker = lines.slice(from, i + 1).some((l) => l.includes(MARKER));
    if (hasMarker) {
      marked.push(`${relative(ROOT, file)}:${i + 1}`);
      return;
    }
    errors.push(
      `${relative(ROOT, file)}:${i + 1} 未 await 且未写明理由 —— 审计写默认必须 await；确不 await 的须在上方加 \`${MARKER}: <理由>\`（见 roadmap §2.1.16 ACT-4/ACT-11）`,
    );
  });
}

if (sites < MIN_SITES) {
  errors.push(
    `全仓仅扫到 ${sites} 处 \`auditService.log(\`（下限 ${MIN_SITES}）—— 写法可能已变，门禁不应真空通过`,
  );
}

if (errors.length > 0) {
  console.error(`✗ 审计写入 await 门禁未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ 审计写入 await 门禁通过：${sites} 处（${awaited} await · ${marked.length} 处有写明理由的 fire-and-forget${marked.length ? `：${marked.join(', ')}` : ''}）`,
);
