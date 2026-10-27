#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Is `Server-NestJS/specs/protocol` a real checkout of the contract submodule?
 *
 * A clone without `--recurse-submodules` (or a ZIP download, which never carries submodules) leaves that
 * path as an EMPTY DIRECTORY. Git then has no repository of its own to find there, so it walks up and
 * answers about the enclosing repository. That is how `check:contract-matrix` used to come back red on a
 * fresh checkout with "README.md says v1.14.0 but the pin's newest tag is v1.2.0" — v1.2.0 being *this*
 * repository's own tag — and with a fix ("edit the README") that would have made the tree wrong instead of
 * right. The same empty directory is what makes the vector gates die with `ERR_MODULE_NOT_FOUND`.
 *
 * Answers from the repository, not from a marker file: `git rev-parse --show-toplevel` inside the path must
 * name the submodule itself. If it names the enclosing repository (empty directory) or fails (a broken
 * checkout, e.g. one that reached this path through a junction), the path is not usable.
 *
 * 判断 `Server-NestJS/specs/protocol` 是不是契约 submodule 的**真检出**。
 *
 * 没带 `--recurse-submodules` 的 clone（或 ZIP 下载 —— 压缩包从不含 submodule）会让该路径只是一个**空目录**。
 * 那里没有自己的仓库，git 于是向上找到**外层仓**并回答外层的问题。`check:contract-matrix` 在新检出上
 * 红成「README.md 写的是 v1.14.0，而 pin 的最新 tag 是 v1.2.0」，那个 v1.2.0 其实是**本仓自己**的 tag；
 * 它给出的修法（「改 README」）会把树改**错**而不是改对。同一个空目录，也是向量门禁死在
 * `ERR_MODULE_NOT_FOUND` 的原因。
 *
 * 判据取自 git 本身、不看标记文件：在该路径里 `git rev-parse --show-toplevel` 必须指向 submodule 自己。
 * 若它指向外层仓（空目录），或者直接失败（检出已坏，例如经 junction 进到这里的），该路径即不可用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SUBMODULE_PATH = 'Server-NestJS/specs/protocol';
export const SUBMODULE_FIX = 'git submodule update --init --recursive';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitToplevel(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * @returns {null | {en: string, zh: string}}
 *   `null` when the submodule is a usable checkout; otherwise the reason, in both languages.
 *   可用时返回 `null`；否则返回中英双语的原因。
 */
export function contractSubmoduleProblem(root = ROOT) {
  // A downloaded archive has no git at all, so "run git submodule update" would be advice that cannot work.
  // Say nothing there and leave those trees to the gates' own behaviour.
  //
  // 下载的压缩包根本没有 git，那时「跑 git submodule update」是一句跑不通的建议。
  // 这种情况什么都不说，把树交给各门禁原本的行为。
  const outer = gitToplevel(root);
  if (!outer) return null;

  const sub = path.join(root, SUBMODULE_PATH);
  if (!fs.existsSync(sub)) {
    return {
      en: `${SUBMODULE_PATH} is missing — the contract submodule was never checked out.`,
      zh: `${SUBMODULE_PATH} 不存在 —— 契约 submodule 从未检出。`,
    };
  }
  const inner = gitToplevel(sub);
  if (!inner) {
    return {
      en: `${SUBMODULE_PATH} is not a usable git checkout (a junction or a copy does not work here).`,
      zh: `${SUBMODULE_PATH} 不是一个可用的 git 检出（junction 或手工拷贝在这里行不通）。`,
    };
  }
  if (inner === outer) {
    return {
      en: `${SUBMODULE_PATH} is not its own repository — git resolves it to this repository instead (typically the contract submodule was never checked out).`,
      zh: `${SUBMODULE_PATH} 不是它自己的仓库 —— git 把它解析到本仓去了（通常是契约 submodule 从未检出）。`,
    };
  }
  return null;
}

/** Print a problem in the shape every gate uses: cause, then the command that fixes it. */
export function printSubmoduleProblem(problem, tag = 'contract-submodule') {
  console.error(`✗ [${tag}] ${problem.en}`);
  console.error(`  ✗ [${tag}] ${problem.zh}`);
  console.error(`  → ${SUBMODULE_FIX}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problem = contractSubmoduleProblem();
  if (problem) {
    printSubmoduleProblem(problem, 'protocol-vectors');
    console.error(`\n修好后再跑本命令。Fix it by running the command above, then re-run this one.\n`);
    process.exit(1);
  }
}
