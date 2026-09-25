#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 单源规则执行化闸（roadmap CE-1 C1）：**触及 tool/治理/审计/事件语义的实现改动，须同批落契约** ——
 * 即「先落契约再改代码」（CE-1 L3）。「落契约」在**契约出仓前**= 改本仓 `specs/protocol/` 内的向量/金样本/schema；
 * **出仓后**= 契约仓先提交、**本仓同批推进子模块指针**（本仓能观测到的契约动作就这一个，详见 CONTRACT_DIRS 注释）。
 *
 * 只检查机器可判定的「语义源实现文件」；语义清单保守（高信号），宁少报：
 * 命中语义源实现变更、但本批无任何 `specs/protocol` / `schemas` 变更 → 提示并 exit 1；
 * 纯重构/注释/无契约影响的改动可用提交信息 trailer `[no-semantic-change]` 显式豁免（评审可见）。
 *
 * 用法（cd Server-NestJS）：
 *   node scripts/check-semantic-single-source.mjs --base <ref>   # 与 <ref>...HEAD 比对
 *   node scripts/check-semantic-single-source.mjs --files "a b"  # 直接给变更文件（CI/测试）
 *   node scripts/check-semantic-single-source.mjs --list         # 打印语义源/契约目录清单
 * 无可用 base（首推/shallow/无 git）→ 跳过（exit 0），不误伤。
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // Server-NestJS/scripts → 仓库根

/** 语义源实现文件（前缀匹配，相对仓库根；变更即暗示协议/治理/审计/事件语义，需同批契约变更） */
const SEMANTIC_SOURCES = [
  'Server-NestJS/src/common/audit-chain/',       // canonical/hash/HMAC（审计链算法）
  'Server-NestJS/src/common/wire-schema/',       // wire Schema 实现
  'Server-NestJS/src/ai/interfaces/tool.interface.ts', // R0-R5 风险级 + 策略表
  'Server-NestJS/src/ai/audit/ai-business-event.ts',   // 业务事件命名（语义）
];

/**
 * 契约真源（任一命中即视为「已落契约」）。两条各管一种形态：
 *
 * 1. `Server-NestJS/specs/protocol/`（**尾斜杠 = 前缀匹配**）—— 覆盖目录内的向量/金样本/schema。这是契约
 *    还在树内时的形态。
 * 2. `Server-NestJS/specs/protocol`（**裸路径 = 精确匹配**）—— **子模块指针本身**。契约出仓后（2026-09-21 起），
 *    本仓能观测到的契约动作就是**指针前进**，而指针变更在 `git diff --name-only` 里正是这条裸路径、
 *    **不以尾斜杠形式出现** —— 只写第 1 条时它匹配不上。
 *
 * 为什么第 2 条非有不可：另一个门 `contract-not-edited-here` **禁止本仓直接改该目录内的文件**，故拆仓后
 * 「已落契约」只剩指针这一条路。缺了它，语义源一改就必然红——**且是假红**（契约其实已随指针落过）。
 * 2026-09-24 实证：一次只碰 `tool.interface.ts` + 指针前进的批次被判 FAIL。
 */
const CONTRACT_DIRS = [
  'Server-NestJS/specs/protocol/', // 目录内文件（向量/金样本/schema）——契约在树内的形态
  'Server-NestJS/specs/protocol', // 子模块指针——契约出仓后本仓唯一的契约动作
];

const EXEMPT_TRAILER = '[no-semantic-change]';

function parseArgs(argv) {
  const out = { base: null, files: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--files') out.files = argv[++i];
    else if (a === '--list') out.list = true;
  }
  return out;
}

function changedFiles(base) {
  const range = base ? `${base}...HEAD` : 'HEAD~1...HEAD';
  try {
    return execSync(`git diff --name-only ${range}`, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null; // 无可用 base（首推/shallow）→ 跳过
  }
}

/**
 * 本批（`base...HEAD`）全部提交信息。**必须扫全区间**：changedFiles 取的是整批 diff，
 * 若只看 HEAD 一条，多提交 PR 里把 trailer 放在非头提交会被静默忽略 → 硬门禁假红。
 * 无 base（`--files` 直给/首推）→ 退化为 HEAD 一条。
 */
function rangeMessages(base) {
  const range = base ? `${base}...HEAD` : '-1';
  try {
    return execSync(`git log ${range} --pretty=%B`, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function isUnder(file, dirOrFile) {
  return dirOrFile.endsWith('/') ? file.startsWith(dirOrFile) : file === dirOrFile;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('语义源实现（变更需同批契约）:');
    for (const s of SEMANTIC_SOURCES) console.log('  - ' + s);
    console.log('契约真源目录（任一变更即满足）:');
    for (const c of CONTRACT_DIRS) console.log('  - ' + c);
    return 0;
  }

  let files;
  if (args.files != null) {
    files = args.files.split(/[\s,]+/).filter(Boolean);
  } else {
    files = changedFiles(args.base);
    if (files == null) {
      console.log('[semantic-single-source] 无可用 base（首推/shallow）→ 跳过');
      return 0;
    }
  }

  if (files.length === 0) {
    console.log('[semantic-single-source] 无变更文件 → PASS');
    return 0;
  }

  const touchedSemantic = files.filter((f) => SEMANTIC_SOURCES.some((s) => isUnder(f, s)));
  if (touchedSemantic.length === 0) {
    console.log('[semantic-single-source] 未触及语义源实现 → PASS');
    return 0;
  }

  const touchedContract = files.filter((f) => CONTRACT_DIRS.some((c) => isUnder(f, c)));
  if (touchedContract.length > 0) {
    console.log(`[semantic-single-source] 语义源 + 契约同批变更 → PASS`);
    console.log('  语义源: ' + touchedSemantic.join(', '));
    console.log('  契约:   ' + touchedContract.join(', '));
    return 0;
  }

  if (rangeMessages(args.base).includes(EXEMPT_TRAILER)) {
    console.log(`[semantic-single-source] 命中豁免 trailer ${EXEMPT_TRAILER} → PASS（评审须可见理由）`);
    console.log('  语义源: ' + touchedSemantic.join(', '));
    return 0;
  }

  console.error(
    '[semantic-single-source] FAIL — 触及语义源实现但本批无 contract 变更（指针前进 / specs/protocol 内文件）',
  );
  console.error('  语义源: ' + touchedSemantic.join(', '));
  console.error('  规则（CE-1 L3 单源）：语义变更须先落契约再改代码——');
  console.error('   · 契约出仓后：先把契约仓的向量/金样本/schema 提交并**推进本仓子模块指针**，同批提交；或');
  console.error(`   · 纯重构/无契约影响 → 提交信息加 trailer "${EXEMPT_TRAILER}"（评审可见）。`);
  return 1;
}

process.exit(main());
