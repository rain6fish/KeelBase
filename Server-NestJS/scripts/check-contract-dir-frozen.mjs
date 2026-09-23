#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Contract-directory freeze gate: this repository must no longer edit files *inside*
 * `Server-NestJS/specs/protocol/`. That layer now lives in its own repository
 * (`rain6fish/keelbase-contract`) and both runtimes consume it as consumers.
 *
 * A change to the *bare* path `Server-NestJS/specs/protocol` is not a violation: once the
 * directory is a submodule, moving the pin forward is the legitimate operation, and
 * `git diff --name-only` reports that gitlink without a trailing slash. Only paths *inside*
 * the directory — which is what editing a contract file produces — fail the gate. That
 * distinction is what lets this gate survive the transition to submodule consumption.
 *
 * The one legitimate change *inside* the directory is the transition itself: the commit that
 * replaces the in-tree directory with the submodule gitlink. That commit may carry the
 * trailer `[contract-dir-transition]`, which is review-visible on purpose.
 *
 * Usage (from the repository root):
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --base <ref>   # diff <ref>...HEAD
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --files "a b"  # explicit paths
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --list         # print the guarded path
 *
 * With no usable base (first push, shallow clone) it announces the skip loudly — it must never
 * pass silently, because a gate that quietly does nothing is indistinguishable from a green one.

 * 契约目录冻结闸：本仓不得再编辑 `Server-NestJS/specs/protocol/` **内部**的文件。那一层已经独立
 * 成仓（`rain6fish/keelbase-contract`），两个 runtime 都只是消费者。
 *
 * 变更**裸路径** `Server-NestJS/specs/protocol` 不算违规：目录成为 submodule 之后，前移钉子正是
 * 合法操作，而 `git diff --name-only` 报出的 gitlink 不带尾斜杠。只有**目录内部**的路径——也就是
 * 编辑契约文件会产生的那种——才会让门禁变红。正是这条区分，让本门禁能安然穿过「转为 submodule
 * 消费」的转换。
 *
 * 唯一合法的「目录内部变更」是转换动作本身：把树内目录换成 submodule gitlink 的那个提交。该提交
 * 可带 trailer `[contract-dir-transition]`，刻意做成评审可见。
 *
 * 用法（在仓库根运行）：
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --base <ref>   # 比对 <ref>...HEAD
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --files "a b"  # 直接给路径
 *   node Server-NestJS/scripts/check-contract-dir-frozen.mjs --list         # 打印被守护的路径
 *
 * 无可用 base（首推 / shallow clone）时**大声宣告跳过**——绝不能静默通过：一个悄悄什么都不做的
 * 门禁，与一个绿色的门禁无法区分。
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // Server-NestJS/scripts → repository root

/** The frozen layer. Files *inside* it are guarded; the bare gitlink path is not. */
const CONTRACT_DIR = 'Server-NestJS/specs/protocol';

/** Trailer that excuses the one legitimate in-tree change: the transition to a submodule. */
const EXEMPT_TRAILER = '[contract-dir-transition]';

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
    return null; // no usable base (first push / shallow) → caller skips loudly
  }
}

/**
 * Every commit message in the range. The range is scanned in full rather than only HEAD:
 * changedFiles covers the whole batch, so a trailer parked on a non-tip commit of a
 * multi-commit PR would otherwise be missed and the gate would red incorrectly.
 */
function rangeMessages(base) {
  const range = base ? `${base}...HEAD` : '-1';
  try {
    return execSync(`git log ${range} --pretty=%B`, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('受守护的契约目录（其**内部**文件不得在本仓编辑）:');
    console.log('  - ' + CONTRACT_DIR + '/');
    console.log('不守护（合法）：裸路径 ' + CONTRACT_DIR + '（submodule 钉子前移）');
    console.log('豁免 trailer: ' + EXEMPT_TRAILER);
    return 0;
  }

  let files;
  if (args.files != null) {
    files = args.files.split(/[\s,]+/).filter(Boolean);
  } else {
    files = changedFiles(args.base);
    if (files == null) {
      console.log('[contract-dir-frozen] SKIP — 无可用 base（首推/shallow）→ 本次未做检查');
      return 0;
    }
  }

  // Only paths *inside* the directory. The bare path (submodule pin bump) is deliberately absent.
  const inside = files.filter((f) => f.startsWith(CONTRACT_DIR + '/'));

  if (inside.length === 0) {
    console.log(`[contract-dir-frozen] PASS — 未触及 ${CONTRACT_DIR}/ 内部（变更 ${files.length} 个文件）`);
    return 0;
  }

  if (rangeMessages(args.base).includes(EXEMPT_TRAILER)) {
    console.log(`[contract-dir-frozen] PASS（豁免）— 命中 trailer ${EXEMPT_TRAILER}，评审须可见理由`);
    console.log('  触及: ' + inside.join(', '));
    return 0;
  }

  console.error(`[contract-dir-frozen] FAIL — 本仓编辑了 ${CONTRACT_DIR}/ 内部的文件`);
  for (const f of inside) console.error('  ' + f);
  console.error('');
  console.error('  规则：契约层已独立成仓（rain6fish/keelbase-contract），主仓是**消费者**。');
  console.error('   · 改契约 → 在那个仓改，升版本，然后在这里前移 submodule 钉子（裸路径，不受本门禁限制）；');
  console.error('   · 「实现先改、契约后补」正是本门禁要消灭的模式，它会制造两边静默分叉。');
  console.error(`   · 唯一的例外是「转为 submodule」的转换提交本身 → 加 trailer "${EXEMPT_TRAILER}"（评审可见）。`);
  return 1;
}

process.exit(main());
