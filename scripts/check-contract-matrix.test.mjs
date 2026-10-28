// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for scripts/check-contract-matrix.mjs (node:test, zero dependencies).
 *
 * The gate compares the two READMEs' `main` row with the tag the contract pin sits on. Its dangerous
 * edge is the one where it cannot read that tag at all: it used to print `跳过` and exit 0, so a tree
 * nobody could verify read exactly like a tree that passed. CI checks submodules out with `--depth=1`,
 * which carries no tags, so every CI run lands on that edge and is saved only by a best-effort fetch —
 * if that fetch fails, the matrix is UNVERIFIED and the gate must say so and fail.
 *
 * Each case below builds a throwaway tree shaped like the repo (both READMEs, both gate scripts, and a
 * contract submodule that is a real git repository) and runs the real script against it. The submodule
 * deliberately has no `origin`, so the best-effort fetch fails deterministically: no network, no sleep.
 *
 * Run: node --test scripts/check-contract-matrix.test.mjs
 *
 * `scripts/check-contract-matrix.mjs` 的测试（node:test，零依赖）。
 *
 * 本闸把两版 README 的 `main` 行与契约 pin 所在的 tag 相比。它危险的边是**根本读不出那个 tag**：
 * 以前它打印 `跳过` 并 exit 0，于是「谁也核验不了的树」读起来与「通过了的树」一模一样。CI 以
 * `--depth=1` 取 submodule（不带 tag），**每次 CI 都落在这条边上**，只靠一次尽力 fetch 兜住 ——
 * 那次也失败时，矩阵就是**未核验**，本闸必须如实说明并判红。
 *
 * 下列每个用例都搭一棵形如本仓的一次性树（两版 README、两个门禁脚本、以及一个**真 git 仓库**的契约
 * submodule），对它跑**真脚本**。submodule 刻意不配 `origin`，于是那次尽力 fetch 必定失败：不联网、不 sleep。
 *
 * 运行：node --test scripts/check-contract-matrix.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUB = 'Server-NestJS/specs/protocol';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};

let workDir;
let seq = 0;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'kb-contract-matrix-'));
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

/**
 * A tree shaped like the repo. `tag` is the tag put on the submodule's single commit (null = none);
 * `version` is what both READMEs name on the `main` row. The submodule has no remote on purpose.
 * 形如本仓的一棵树。`tag` 是打在 submodule 唯一提交上的 tag（null = 不打）；`version` 是两版 README
 * `main` 行写着的版本。submodule 刻意不配远端。
 */
function makeTree({ tag = 'v1.14.0', version = 'v1.14.0' } = {}) {
  const root = join(workDir, `tree-${(seq += 1)}`);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  const sub = join(root, ...SUB.split('/'));
  mkdirSync(sub, { recursive: true });

  for (const file of ['check-contract-matrix.mjs', 'require-contract-submodule.mjs']) {
    cpSync(join(HERE, file), join(root, 'scripts', file));
  }

  writeFileSync(
    join(root, 'README.md'),
    `# Fixture\n\n| Project | Line | Contract |\n|---|---|---|\n| \`KeelBase\` (TypeScript) | \`main\`, **unreleased** | **${version}** — bound as a submodule |\n`,
    'utf8',
  );
  writeFileSync(
    join(root, 'README.zh-CN.md'),
    `# 夹具\n\n| 项目 | 线 | 契约 |\n|---|---|---|\n| **KeelBase**（TypeScript） | \`main\`，**未发布** | **${version}**——以 submodule 绑定 |\n`,
    'utf8',
  );

  git(root, ['init', '-q', '-b', 'main']);
  git(sub, ['init', '-q', '-b', 'main']);
  writeFileSync(join(sub, 'README.md'), 'fixture contract\n', 'utf8');
  git(sub, ['add', '--', 'README.md']);
  git(sub, ['commit', '-q', '-m', 'fixture']);
  if (tag) git(sub, ['tag', tag]);

  return root;
}

const run = (root) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'check-contract-matrix.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });

test('the pin carries the tag the matrix names: exit 0 — pin 带着矩阵写着的 tag：退出 0', () => {
  const root = makeTree({ tag: 'v1.14.0', version: 'v1.14.0' });
  const r = run(root);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /OK —— `main` 行 = pin 的 tag = v1\.14\.0/);
});

test('a named version that is not the pin tag: exit 1 — 写着的版本不是 pin 的 tag：退出 1', () => {
  const root = makeTree({ tag: 'v1.14.0', version: 'v1.13.0' });
  const r = run(root);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /写的是 v1\.13\.0，而 pin 的最新 tag 是 v1\.14\.0/);
});

test('no tag resolves and the fetch fails: exit 1 with the command that fixes it — 解析不到 tag 且取 tags 也失败：退出 1 并给出修它的命令', () => {
  const root = makeTree({ tag: null, version: 'v1.14.0' });
  const r = run(root);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /Cannot verify — no tag resolves/);
  assert.match(r.stderr, new RegExp(`git -C ${SUB} fetch --tags`));
  assert.match(r.stderr, /npm run check:contract-matrix/);
  assert.doesNotMatch(r.stdout, /跳过/);
});
