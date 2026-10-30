#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Give a fresh checkout everything `npm run check:all` needs — in one idempotent command.
 *
 * `check:all` is honest about missing prerequisites: each red gate names the command that fixes it,
 * and the summary lists them all before the table. But that still asks a reader to work out which of
 * five reds share one cause, run those commands in the right directories, and re-run. Measured on a
 * bare clone (2026-10-28): 24/29, five red, all five from missing prerequisites. This script is that
 * "read the five hints and do them" step turned into one command.
 *
 * It does only what a gate itself declares it needs — nothing is built, no test is run, nothing
 * unrelated is downloaded:
 *   - the contract submodule, at the commit this checkout pins       (`check:contract-matrix`, `check:protocol-vectors`)
 *   - `Server-NestJS` dependencies                                    (`check:app-wiring`, `check:test-types`)
 *   - `Web-Admin-Vue` dependencies                                    (recipe §8's `deploy/demo.sh`)
 *   - `Server-NestJS/.env`, copied from `.env.example` if absent       (recipe §7–§8)
 *   - the sibling Java checkout, if absent                            (`check:java-vectors` names this clone)
 *
 * Idempotent: readiness is re-derived from the tree every run, never from a marker file, so a second
 * run performs no action, prints "nothing to do", and exits 0. A step that cannot be completed stops
 * the run with what failed, why, and the command to run by hand.
 *
 * 把 `npm run check:all` 所需的前提一次补齐 —— 一条幂等命令。
 *
 * `check:all` 对缺前提这件事是诚实的：每道红闸都写着修它的命令，汇总表之前也把先决条件列了一遍。
 * 但那仍然要读者自己看出「五条红里有几条同一个病根」、在正确的目录里逐条跑、再复跑。空检出实测
 * （2026-10-28）：24/29，五条红，全部来自前提缺失。本脚本就是「读完那五条提示并照做」这一步本身。
 *
 * 只做**各道闸自己声明过**的前提 —— 不构建、不跑测试、不拉无关的东西：
 *   - 契约 submodule，落在本检出 pin 的那个提交上          （`check:contract-matrix`、`check:protocol-vectors`）
 *   - `Server-NestJS` 的依赖                             （`check:app-wiring`、`check:test-types`）
 *   - `Web-Admin-Vue` 的依赖                             （recipe §8 的 `deploy/demo.sh`）
 *   - `Server-NestJS/.env`，缺失时从 `.env.example` 拷      （recipe §7–§8）
 *   - 同级的 Java 检出，缺失时克隆                          （`check:java-vectors` 给出的就是这条命令）
 *
 * 幂等：每次运行都**从树本身重新判定**是否已就绪，不认标记文件；故第二次运行不做任何动作、
 * 打印「无需动作」、exit 0。某一步做不到时立即停下，说清哪一步、为什么、以及要手工跑什么。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractSubmoduleProblem, SUBMODULE_PATH } from './require-contract-submodule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JAVA_REPO_URL = 'https://github.com/rain6fish/KeelBase4J.git';

/** `conformance/vectors/schemas` is the directory `check:java-vectors` reads on the Java side. */
const JAVA_VECTORS_DIR = 'conformance/vectors/schemas';

const exists = (p) => fs.existsSync(p);
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const rel = (...parts) => path.join(ROOT, ...parts);

/**
 * Where `check:java-vectors` will look for the Java checkout: `$KEELBASE_JAVA_REPO` when set (resolved
 * against this checkout's root, the way the gate does), otherwise `../KeelBase4J` beside the clone.
 *
 * `check:java-vectors` 去哪里找 Java 检出：设了 `$KEELBASE_JAVA_REPO` 就用它（按本检出根解析，
 * 与门禁一致），否则用克隆旁边的 `../KeelBase4J`。
 */
function javaRepo() {
  const fromEnv = process.env.KEELBASE_JAVA_REPO?.trim();
  return {
    fromEnv: Boolean(fromEnv),
    path: fromEnv ? path.resolve(ROOT, fromEnv) : path.join(path.dirname(ROOT), 'KeelBase4J'),
  };
}

const javaReady = () => isDir(path.join(javaRepo().path, JAVA_VECTORS_DIR));

// `git` is a real executable on every platform this runs on; `npm` is a shell script on Windows
// (`npm.cmd`), so only that one goes through the shell.
//
// `git` 在会跑到的平台上都是真正的可执行文件；`npm` 在 Windows 上是脚本（`npm.cmd`），故只有它走 shell。
function runGit(args, cwd) {
  return spawnSync('git', args, { cwd, stdio: 'inherit' }).status === 0;
}

function runNpm(cwd) {
  return spawnSync('npm install', { cwd, stdio: 'inherit', shell: true }).status === 0;
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const gitToplevel = (cwd) => git(cwd, ['rev-parse', '--show-toplevel']);

/**
 * The commit this checkout records for the submodule, and the commit it actually has.
 *
 * `contractSubmoduleProblem` answers "is that path its own repository" — which is what the gates need to
 * stop resolving it to the enclosing repository. It does not answer "is it the commit this checkout
 * pins", and an earlier version of this script treated the first answer as the second: after a failed
 * fetch left the submodule parked on its remote's default branch, the next run called the step ready and
 * moved on. The vector gate regenerates its corpus from whatever is checked out there and diffs it
 * against that same tree's committed files, so the wrong commit does not announce itself — it silently
 * changes what "the gate is green" means. Comparing HEAD with the recorded pin is the cheap way to make
 * readiness mean the same thing the gates mean.
 *
 * 本检出为 submodule 记录的提交，以及它实际所在的提交。
 *
 * `contractSubmoduleProblem` 回答的是「该路径是不是它自己的仓库」—— 那是各道闸需要的答案（好让 git 不再
 * 把它解析到外层仓）。它**不**回答「处不处在本检出 pin 的那个提交上」，而本脚本早先的一版把前一个答案当成了
 * 后一个：一次失败的拉取把 submodule 留在其远端的默认分支上之后，下一次运行就判它「已就绪」继续往下走。
 * 向量闸是拿那里检出什么就从什么重新生成、再与**同一棵树**里提交的语料比 —— 所以错误的提交不会自己声张，
 * 它只是悄悄改变了「闸绿」的含义。把 HEAD 与记录的 pin 一比，就是让「就绪」与各道闸同义的最省事的办法。
 */
const submodulePin = () => {
  const out = git(ROOT, ['ls-tree', 'HEAD', SUBMODULE_PATH]);
  return out?.match(/^160000 commit ([0-9a-f]{40})/)?.[1] ?? null;
};
const submoduleHead = () => git(path.join(ROOT, SUBMODULE_PATH), ['rev-parse', 'HEAD']);

const STEPS = [
  {
    id: 'contract-submodule',
    missing: {
      en: `${SUBMODULE_PATH} is not the contract submodule at the pinned commit`,
      zh: `${SUBMODULE_PATH} 不是落在 pin 提交上的契约 submodule`,
    },
    ready: () => {
      if (contractSubmoduleProblem(ROOT) !== null) return false;
      const pin = submodulePin();
      return pin !== null && submoduleHead() === pin;
    },
    fix() {
      return runGit(['submodule', 'update', '--init', '--recursive'], ROOT);
    },
    after: {
      en: 'If this failed, read git\'s own error above: a network/auth problem on the URL in .gitmodules, or `upload-pack: not our ref <sha>` — that one means the pinned commit is not published on the contract remote yet, which is a state of the repository, not of your machine.',
      zh: '若失败，读上面 git 自己的报错：`.gitmodules` 里那个 URL 的网络或认证问题；或者是 `upload-pack: not our ref <sha>` —— 后者意味着本仓 pin 的那个提交还没推到契约远端，那是**仓库的状态**，不是你机器的毛病。',
    },
  },
  {
    id: 'server-deps',
    missing: {
      en: 'Server-NestJS/node_modules lacks jest and/or tsc (check:app-wiring and check:test-types need them)',
      zh: 'Server-NestJS/node_modules 缺 jest 和/或 tsc（check:app-wiring 与 check:test-types 要它们）',
    },
    ready: () =>
      exists(rel('Server-NestJS', 'node_modules', 'jest', 'bin', 'jest.js')) &&
      exists(rel('Server-NestJS', 'node_modules', 'typescript', 'bin', 'tsc')),
    fix() {
      return runNpm(rel('Server-NestJS'));
    },
    after: {
      en: 'If this failed: `npm install` printed the reason — a registry/auth/network problem, or an engine mismatch (`Server-NestJS/package.json` → engines). Nothing else here can fix that.',
      zh: '若失败：`npm install` 已经把原因打出来了 —— 多半是 registry / 认证 / 网络，或 engines 不匹配（见 `Server-NestJS/package.json`）。本脚本修不了这一类。',
    },
  },
  {
    id: 'web-deps',
    missing: {
      en: 'Web-Admin-Vue/node_modules lacks vite (step 8\'s deploy/demo.sh builds the admin bundle)',
      zh: 'Web-Admin-Vue/node_modules 缺 vite（第 8 步的 deploy/demo.sh 要构建管理台产物）',
    },
    ready: () => exists(rel('Web-Admin-Vue', 'node_modules', 'vite', 'bin', 'vite.js')),
    fix() {
      return runNpm(rel('Web-Admin-Vue'));
    },
    after: {
      en: 'If this failed: same class as server-deps — read npm\'s own output. This one is not needed by any `check:*` gate, only by recipe step 8.',
      zh: '若失败：与 server-deps 同类 —— 读 npm 自己的输出。这一项 `check:*` 门禁都不需要，只有 recipe 第 8 步要。',
    },
  },
  {
    id: 'env-file',
    missing: {
      en: 'Server-NestJS/.env is missing (recipe steps 7–8 read it; .env.example carries usable defaults)',
      zh: 'Server-NestJS/.env 缺失（recipe 第 7–8 步要读它；.env.example 本身就带可用默认值）',
    },
    ready: () => exists(rel('Server-NestJS', '.env')),
    fix() {
      const example = rel('Server-NestJS', '.env.example');
      if (!exists(example)) {
        console.error(`  ✗ ${path.relative(ROOT, example)} is missing too — this checkout is not what the recipe expects.`);
        console.error(`  ✗ 连 ${path.relative(ROOT, example)} 都不在 —— 这份检出不是 recipe 期望的样子。`);
        return false;
      }
      try {
        fs.copyFileSync(example, rel('Server-NestJS', '.env'), fs.constants.COPYFILE_EXCL);
        return true;
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        console.error(`  ✗ ${err.message}`);
        return false;
      }
    },
    after: {
      en: 'If this failed: .env is never overwritten — if one exists it was left alone. Delete it yourself only if you mean to.',
      zh: '若失败：.env **从不被覆盖** —— 已存在就原样留着。只有你确定要重置时才自己删它。',
    },
  },
  {
    id: 'java-sibling',
    missing: {
      en: 'the sibling Java checkout is missing (check:java-vectors compares this repo\'s vectors against it)',
      zh: '同级 Java 检出缺失（check:java-vectors 拿本仓向量与它比对）',
    },
    ready: javaReady,
    fix() {
      const { fromEnv, path: dest } = javaRepo();
      const shown = path.relative(path.dirname(ROOT), dest) || dest;
      if (fromEnv) {
        // A path the caller named is never created for them: they pointed there for a reason.
        //
        // 调用方点名过的路径不去替他们建 —— 指到那里是有原因的。
        console.error(`  ✗ KEELBASE_JAVA_REPO points at ${dest}, which has no ${JAVA_VECTORS_DIR}/.`);
        console.error(`  ✗ KEELBASE_JAVA_REPO 指向的 ${dest} 里没有 ${JAVA_VECTORS_DIR}/。`);
        console.error(`  → point it at your Java checkout, or unset it and re-run to clone ${shown} from ${JAVA_REPO_URL}`);
        console.error(`  → 把它指向你手头那份 Java 检出，或者 unset 后重跑，让本脚本从 ${JAVA_REPO_URL} 克隆 ${shown}`);
        return false;
      }
      if (exists(dest)) {
        // Something is already there. Cloning would exit 128, and deleting a directory that might be
        // the user's Java repo is not this script's call.
        //
        // 那里已经有东西了：克隆会 exit 128，而删掉一个可能是用户自用 Java 仓的目录不是本脚本说了算的。
        console.error(`  ✗ ${dest} already exists but has no ${JAVA_VECTORS_DIR}/ — not cloning over it, not deleting it.`);
        console.error(`  ✗ ${dest} 已存在但没有 ${JAVA_VECTORS_DIR}/ —— 既不覆盖克隆，也不删除。`);
        console.error(`  → if that is your Java checkout, run \`export KEELBASE_JAVA_REPO=${dest}\` and re-run; otherwise move it aside.`);
        console.error(`  → 若那就是你的 Java 检出，跑 \`export KEELBASE_JAVA_REPO=${dest}\` 后重跑；否则把它挪开。`);
        return false;
      }
      return runGit(['clone', '--depth', '1', JAVA_REPO_URL, dest], path.dirname(ROOT));
    },
    after: {
      en: 'If this failed: the clone\'s own error is above (offline, or no access to the repository). Clone it by hand with the command in check:java-vectors, or point KEELBASE_JAVA_REPO at a copy you already have.',
      zh: '若失败：克隆自己的报错在上面（离线，或访问不到该仓）。按 check:java-vectors 里那条命令手工克隆，或用 KEELBASE_JAVA_REPO 指向你已有的一份。',
    },
  },
];

function say(lines) {
  for (const line of lines) console.log(line);
}

say([
  'prereqs — everything `npm run check:all` needs, in one idempotent command.',
  'prereqs —— `npm run check:all` 所需的前提，一条幂等命令补齐。',
  `  root: ${ROOT}`,
  '',
]);

// An archive has no git, so `git submodule update` is advice that cannot work there. Say that once,
// loudly, instead of running a command that fails for a reason the reader cannot see.
//
// 压缩包没有 git，在那里 `git submodule update` 是一句跑不通的建议。在这里一次说清楚，
// 而不是跑一条失败原因看不见的命令。
if (!gitToplevel(ROOT)) {
  console.error('✗ This is not a git checkout, so the contract submodule cannot be fetched.');
  console.error('✗ 这不是一个 git 检出，契约 submodule 无从获取。');
  console.error('  → clone the repository instead of downloading an archive:');
  console.error('  → 请克隆仓库而不是下载压缩包：');
  console.error('    git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git');
  process.exit(1);
}

const todo = STEPS.filter((s) => !s.ready());
if (todo.length === 0) {
  say([
    '✓ Nothing to do — every gate prerequisite is already in place.',
    '✓ 无需动作 —— 每道门禁的前提都已就位。',
    '',
    '  Next / 下一步: npm run check:all',
  ]);
  process.exit(0);
}

say([
  `${todo.length} of ${STEPS.length} prerequisites missing / ${STEPS.length} 项前提里有 ${todo.length} 项缺失：`,
  ...todo.map((s) => `  ✗ ${s.id} — ${s.missing.en}`),
  ...todo.map((s) => `    ${s.id} — ${s.missing.zh}`),
  '',
]);

for (const step of todo) {
  console.log(`▶ ${step.id}`);
  const t0 = Date.now();
  const ran = step.fix();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!ran || !step.ready()) {
    console.error(`\n✗ ${step.id} — still not satisfied after ${secs}s.`);
    console.error(`✗ ${step.id} —— ${secs}s 后仍未就绪。`);
    console.error(`  ${step.after.en}`);
    console.error(`  ${step.after.zh}`);
    console.error('\n  Nothing after this step was attempted. Re-run `npm run prereqs` once it is fixed.');
    console.error('  这一步之后的都没做。修好后重跑 `npm run prereqs`。');
    process.exit(1);
  }
  console.log(`  ✓ ${secs}s`);
}

say([
  '',
  `✓ All ${todo.length} missing prerequisites are in place now. Re-run to confirm: it will print "nothing to do".`,
  `✓ ${todo.length} 项缺失的前提现在都已就位。再跑一次可自证：它会打印「无需动作」。`,
  '',
  '  Next / 下一步: npm run check:all',
]);
