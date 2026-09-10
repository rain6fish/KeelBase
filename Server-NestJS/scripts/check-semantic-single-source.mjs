#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 单源规则执行化闸（roadmap CE-1 C1）：**触及 tool/治理/审计/事件语义的实现改动，须同批落
 * `specs/protocol`（向量/金样本）或 `schemas`（wire Schema）** —— 即「先落契约再改代码」（CE-1 L3）。
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

/** 契约真源目录（任一变更即视为已落契约） */
const CONTRACT_DIRS = [
  'Server-NestJS/specs/protocol/',
  'Server-NestJS/specs/protocol/schemas/',
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

function headMessage() {
  try {
    return execSync('git log -1 --pretty=%B', { cwd: ROOT, encoding: 'utf8' });
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

  if (headMessage().includes(EXEMPT_TRAILER)) {
    console.log(`[semantic-single-source] 命中豁免 trailer ${EXEMPT_TRAILER} → PASS（评审须可见理由）`);
    console.log('  语义源: ' + touchedSemantic.join(', '));
    return 0;
  }

  console.error('[semantic-single-source] FAIL — 触及语义源实现但本批无 specs/protocol 或 schemas 变更');
  console.error('  语义源: ' + touchedSemantic.join(', '));
  console.error('  规则（CE-1 L3 单源）：语义变更须先落契约再改代码——');
  console.error('   · 更新 Server-NestJS/specs/protocol（向量/金样本）或 schemas（wire Schema）后同批提交；或');
  console.error(`   · 纯重构/无契约影响 → 提交信息加 trailer "${EXEMPT_TRAILER}"（评审可见）。`);
  return 1;
}

process.exit(main());
