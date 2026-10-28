#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The compatibility matrix names a contract version for `main`; this checks it is still true.
 *
 * The README says what the submodule pin actually holds, and the pin moves whenever the contract gets a
 * commit — not only at a release. Nothing else reads that row, so it can rot silently: on 2026-10-10 the
 * pin advanced one commit past its tag and the table kept naming the tag with no marker (gate added the
 * same day). This resolves the pin's own tag and compares it with the two READMEs.
 *
 * A pin ahead of its tag is a *warning*, not a failure: the named version is still the newest released
 * one, and the table's reader is not misled about it — they just are not told there is unreleased work.
 * Only a named version that is not the pin's tag at all fails.
 *
 * 兼容矩阵给 `main` 写的契约版本，本闸核对它是否仍成立。
 *
 * README 说的是 submodule pin **实际持有的**东西，而 pin 在契约**每次**有新提交时都会前进 —— 不只在发版时。
 * 没有别的东西读那一行，所以它会悄悄烂掉：2026-10-10 pin 前进到 tag 之后一个提交，表里仍写着那个 tag、毫无
 * 标记（本闸同日补上）。本闸解析 pin 自身的 tag，与两版 README 比对。
 *
 * **pin 领先 tag 是「告警」而非「失败」**：写着的仍是最新**已发布**的版本，读表的人不会被误导 —— 只是没被
 * 告知还有未发布的活。只有**写的版本根本不是 pin 的 tag** 才算失败。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contractSubmoduleProblem,
  printSubmoduleProblem,
  SUBMODULE_FIX,
} from './require-contract-submodule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUB = 'Server-NestJS/specs/protocol';
const READMES = ['README.md', 'README.zh-CN.md'];

const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const sub = path.join(ROOT, SUB);

// Without this, an uninitialised submodule (an empty directory) makes every `gitIn(sub, …)` below answer
// about the ENCLOSING repository: `describe --tags` returns this repo's own tag, and the gate then reports a
// README/contract mismatch that does not exist — plus a fix that would make the tree wrong.
//
// 少了这一步，未初始化的 submodule（空目录）会让下面每个 `gitIn(sub, …)` 回答**外层仓**的问题：
// `describe --tags` 给出本仓自己的 tag，于是门禁报告一个并不存在的 README/契约不符 —— 还附一条会把树改**错**的修法。
const problem = contractSubmoduleProblem(ROOT);
if (problem) {
  printSubmoduleProblem(problem, 'contract-matrix');
  process.exit(1);
}

/** Resolve the pin's own tag; returns null when the checkout carries no tags. 解析 pin 自身的 tag；无 tag 时返回 null。 */
function resolvePin() {
  const tag = gitIn(sub, ['describe', '--tags', '--abbrev=0']);
  const ahead = Number(gitIn(sub, ['rev-list', '--count', `${tag}..HEAD`])) || 0;
  const extra = ahead > 0 ? gitIn(sub, ['log', '--oneline', `${tag}..HEAD`]).split('\n').filter(Boolean) : [];
  return { tag, ahead, extra };
}

/** Whether `sub` is a git checkout at all — a downloaded archive has none, and needs other advice. */
const subIsGitCheckout = () => {
  try {
    gitIn(sub, ['rev-parse', '--show-toplevel']);
    return true;
  } catch {
    return false;
  }
};

let pin;
try {
  pin = resolvePin();
} catch {
  // A checkout can hold the submodule without its tags: CI checks submodules out with `--depth=1`, so
  // every CI run lands here (`No names found, cannot describe anything`) and only the fetch below gets
  // the tags. One best-effort fetch stays; if it fails too, the pin's version cannot be read at all —
  // the matrix is UNVERIFIED, not satisfied, so this fails (2026-10-27: "a contract gate reddens when it
  // cannot verify") and names the command that fixes it. Local full clones resolve the tag above and
  // never reach this branch, so nothing here makes a network round-trip a prerequisite for green.
  //
  // 检出里可能带着 submodule 却没有它的 tag：CI 以 `--depth=1` 取 submodule，于是**每次 CI 都走到这里**
  // （`No names found, cannot describe anything`），只有下面这一次 fetch 能拿到 tag。尽力取一次仍不行，
  // 就说明 pin 的版本**根本读不出来** —— 此时矩阵是**未核验**、不是「通过」，故判红（2026-10-27 裁决：
  // 「契约门禁在无法核验时判红」）并给出修它的命令。本地完整 clone 在上一步就解析到 tag、走不到这里，
  // 所以这里不会让「联网」成为变绿的先决条件。
  try {
    gitIn(sub, ['fetch', '--tags', '--depth=1', 'origin']);
    pin = resolvePin();
  } catch {
    if (subIsGitCheckout()) {
      console.error(`✗ [contract-matrix] Cannot verify — no tag resolves in ${SUB}, and fetching tags failed.`);
      console.error(`✗ [contract-matrix] 无法核验 —— ${SUB} 里解析不到 tag，取 tags 也失败。`);
      console.error(`  → git -C ${SUB} fetch --tags`);
      console.error(`  → then re-run: npm run check:contract-matrix`);
      console.error(`  → 然后重跑：npm run check:contract-matrix`);
    } else {
      console.error(`✗ [contract-matrix] Cannot verify — ${SUB} is not a git checkout here (a downloaded archive carries no submodule), so the pin's tag cannot be read.`);
      console.error(`✗ [contract-matrix] 无法核验 —— 这里的 ${SUB} 不是 git 检出（下载的压缩包不含 submodule），读不出 pin 的 tag。`);
      console.error(`  → ${SUBMODULE_FIX}`);
      console.error(`  → 这里需要一份把 submodule 初始化过的 git 检出。`);
    }
    process.exit(1);
  }
}
const { tag, ahead, extra } = pin;

const failures = [];
for (const file of READMES) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // The row a reader uses to answer "which contract is `main` on". Tolerant of the zh table's full-width
  // parentheses and of the em-dash clause that follows the version.
  // 读者用来回答「`main` 落在哪版契约上」的那一行。容忍中文表里的全角括号、以及版本后面的破折号从句。
  const line = text.split('\n').find((l) => l.includes('KeelBase') && l.includes('TypeScript') && l.includes('`main`'));
  if (!line) {
    failures.push(`${file} — 找不到 \`main\` 那一行`);
    continue;
  }
  const m = line.match(/\*\*(v\d+\.\d+\.\d+)\*\*/);
  if (!m) {
    failures.push(`${file} — \`main\` 行里找不到契约版本（\`**vX.Y.Z**\`）`);
    continue;
  }
  if (m[1] !== tag) {
    failures.push(`${file} — 写的是 ${m[1]}，而 pin 的最新 tag 是 ${tag}`);
  }
}

if (failures.length > 0) {
  console.error(`\n[contract-matrix] ${failures.length} 处不符：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n把 \`main\` 那一行改成 pin 的 tag（两版 README 都要改）。\n` +
      `Update the \`main\` row to the pin's tag in both READMEs.\n`,
  );
  process.exit(1);
}

if (ahead > 0) {
  console.warn(
    `[contract-matrix] OK —— 但 pin 领先 tag ${tag} 有 ${ahead} 个未发布的提交：`,
  );
  for (const l of extra) console.warn(`    · ${l}`);
  console.warn(
    `  （写着的 ${tag} 仍是最新已发布的版本；若要如实说明「已承诺的对象」超出它，可另加一句。告警不阻塞。）`,
  );
} else {
  console.log(`[contract-matrix] OK —— \`main\` 行 = pin 的 tag = ${tag}`);
}
