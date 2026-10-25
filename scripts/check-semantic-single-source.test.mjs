#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for Server-NestJS/scripts/check-semantic-single-source.mjs (node:test, zero
 * dependencies). Commit bab9c1f1 added revoke-class.ts to SEMANTIC_SOURCES but left no test behind it,
 * so deleting that line again would silently reopen the hole. The 2026-10-25 directory sweep added eight
 * more files from the same directory, each with its own pair of cases. The cases below pin the entries
 * and the gate's decision order: a semantic-only change is red, and a contract change or the
 * `[no-semantic-change]` trailer turns it green.
 *
 * Every fixture is a throwaway git repository under the OS temp directory that carries its own copy of
 * the real gate. That keeps the assertions independent of this checkout's branch, working-tree dirt and
 * HEAD commit message — the gate reads `git log` for the trailer, so the commit text must be ours.
 *
 * Run: node --test scripts/check-semantic-single-source.test.mjs
 *
 * check-semantic-single-source.mjs 的回归测试（node:test，零依赖）。提交 bab9c1f1 把 revoke-class.ts
 * 补进 SEMANTIC_SOURCES，却没留下任何测试 —— 再删掉那一行就会悄悄把洞重新打开。2026-10-25 的目录巡查又
 * 从同一目录补了八个文件，每个各带一对用例。下列用例把这些条目和闸的判定顺序都钉住：只改语义源 ⇒ 红；
 * 同批改契约、或提交信息带 `[no-semantic-change]` trailer ⇒ 绿。
 *
 * 每个 fixture 都是操作系统临时目录下的一次性 git 仓，带着真实闸的一份副本。于是断言不依赖本检出的分支、
 * 工作树脏改，也不依赖 HEAD 的提交信息 —— 闸会读 `git log` 找 trailer，那段文字必须由测试自己写。
 *
 * 运行：node --test scripts/check-semantic-single-source.test.mjs
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const GATE_REL = 'Server-NestJS/scripts/check-semantic-single-source.mjs';
const GATE = join(ROOT, GATE_REL);
const REVOKE_CLASS = 'Server-NestJS/src/governance-shared/services/revoke-class.ts';

/**
 * The files added to the gate on 2026-10-25, when the directory sweep closed the hole the revoke-class
 * entry left open. Each of them owns a vocabulary or payload the contract records, so a change of meaning
 * there has to land a contract change in the same batch.
 *
 * 2026-10-25 补进闸的一批文件 —— 那次目录巡查补上了 revoke-class 那一条留下的洞。它们各自拥有契约记录的
 * 词表或载荷，所以改其语义必须同批落契约。
 */
const SWEPT_2026_10_25 = [
  'Server-NestJS/src/governance-shared/services/audit-evidence.service.ts',
  'Server-NestJS/src/governance-shared/services/audit.service.ts',
  'Server-NestJS/src/governance-shared/services/effect-chain.ts',
  'Server-NestJS/src/governance-shared/services/effect-composition.ts',
  'Server-NestJS/src/governance-shared/services/effect-projection.ts',
  'Server-NestJS/src/governance-shared/services/effect-revoke.ts',
  'Server-NestJS/src/governance-shared/services/governance-policy.service.ts',
  'Server-NestJS/src/governance-shared/services/tool-metadata.ts',
];
const CONTRACT_FILE = 'Server-NestJS/specs/protocol/vectors/revoke-class.json';
const CONTRACT_POINTER = 'Server-NestJS/specs/protocol';
const TRAILER = '[no-semantic-change]';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};

const git = (cwd, ...args) =>
  spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV });

const mustGit = (cwd, ...args) => {
  const r = git(cwd, ...args);
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}${r.stdout}`);
  return r.stdout.trim();
};

const fixtures = [];

after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * Build a fixture repo whose `Server-NestJS/scripts/` holds a copy of the real gate, and commit a base
 * snapshot. Returns the fixture root and the base commit SHA.
 * 建一个 fixture 仓：`Server-NestJS/scripts/` 里放真实闸的副本，并提交一个基线快照。
 * 返回 fixture 根目录与基线提交 SHA。
 */
const makeFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-semantic-gate-'));
  fixtures.push(dir);
  mkdirSync(join(dir, 'Server-NestJS/scripts'), { recursive: true });
  copyFileSync(GATE, join(dir, GATE_REL));
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  mustGit(dir, 'init', '-q', '-b', 'main');
  mustGit(dir, 'add', '--', 'README.md', GATE_REL);
  mustGit(dir, 'commit', '-q', '-m', 'base snapshot');
  return { dir, base: mustGit(dir, 'rev-parse', 'HEAD') };
};

const writeFiles = (dir, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  mustGit(dir, 'add', '--', ...Object.keys(files));
};

const commitFiles = (dir, files, message) => {
  writeFiles(dir, files);
  mustGit(dir, 'commit', '-q', '-m', message);
};

const runGate = (dir, ...args) =>
  spawnSync(process.execPath, [join(dir, GATE_REL), ...args], { encoding: 'utf8' });

test('the real gate lists revoke-class.ts among its semantic sources — 真闸把 revoke-class.ts 列为语义源', () => {
  const r = spawnSync(process.execPath, [GATE, '--list'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(
    r.stdout.includes(REVOKE_CLASS),
    `--list does not name ${REVOKE_CLASS}:\n${r.stdout}`,
  );
});

test('the real gate lists every file swept in on 2026-10-25 — 真闸列全 2026-10-25 补进的那一批', () => {
  const r = spawnSync(process.execPath, [GATE, '--list'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const file of SWEPT_2026_10_25) {
    assert.ok(r.stdout.includes(file), `--list does not name ${file}:\n${r.stdout}`);
  }
});

for (const file of SWEPT_2026_10_25) {
  const name = file.split('/').at(-1);
  test(`a ${name} change alone, no contract and no trailer, is red — 只改 ${name}、无契约无 trailer ⇒ 红`, () => {
    const { dir, base } = makeFixture();
    commitFiles(dir, { [file]: '// changed semantics\n' }, 'touch one semantic source only');

    const r = runGate(dir, '--base', base);
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /FAIL/);
    assert.ok(r.stderr.includes(file), `failure does not name the source:\n${r.stderr}`);
  });

  test(`a ${name} change with the exemption trailer is green — 改 ${name} 带豁免 trailer ⇒ 绿`, () => {
    const { dir, base } = makeFixture();
    commitFiles(dir, { [file]: '// pure refactor\n' }, `refactor: rename a local\n\n${TRAILER}`);

    const r = runGate(dir, '--base', base);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(TRAILER), r.stdout);
  });
}

test('a revoke-class.ts change alone, no contract and no trailer, is red — 只改 revoke-class.ts、无契约无 trailer ⇒ 红', () => {
  const { dir, base } = makeFixture();
  commitFiles(dir, { [REVOKE_CLASS]: '// changed semantics\n' }, 'touch revoke-class only');

  const r = runGate(dir, '--base', base);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /FAIL/);
  assert.ok(r.stderr.includes(REVOKE_CLASS), `failure does not name the source:\n${r.stderr}`);
});

test('the same change plus a contract file is green — 同一改动加一份契约文件 ⇒ 绿', () => {
  const { dir, base } = makeFixture();
  commitFiles(
    dir,
    {
      [REVOKE_CLASS]: '// changed semantics\n',
      [CONTRACT_FILE]: '{}\n',
    },
    'contract lands with the implementation',
  );

  const r = runGate(dir, '--base', base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes('语义源 + 契约同批变更 → PASS'), r.stdout);
});

test('the same change plus the bare protocol submodule pointer is green — 同一改动加裸的协议子模块指针 ⇒ 绿', () => {
  const { dir, base } = makeFixture();
  writeFiles(dir, { [REVOKE_CLASS]: '// changed semantics\n' });
  // A gitlink is what `git diff --name-only` reports for a submodule pointer move: the bare path.
  // gitlink 就是 `git diff --name-only` 对子模块指针前进报出的形状：那条裸路径。
  mustGit(dir, 'update-index', '--add', '--cacheinfo', `160000,${base},${CONTRACT_POINTER}`);
  mustGit(dir, 'commit', '-q', '-m', 'advance the protocol pointer');

  const r = runGate(dir, '--base', base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes('语义源 + 契约同批变更 → PASS'), r.stdout);
});

test('the same change with the exemption trailer is green — 同一改动带豁免 trailer ⇒ 绿', () => {
  const { dir, base } = makeFixture();
  commitFiles(
    dir,
    { [REVOKE_CLASS]: '// pure refactor\n' },
    `refactor: move revoke-class\n\n${TRAILER}`,
  );

  const r = runGate(dir, '--base', base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes(`${TRAILER}`), r.stdout);
});

test('a change outside the semantic sources stays green — 改动不落在语义源上 ⇒ 仍是绿', () => {
  const { dir, base } = makeFixture();
  commitFiles(dir, { 'Server-NestJS/src/other/file.ts': '// unrelated\n' }, 'touch an unrelated file');

  const r = runGate(dir, '--base', base);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes('未触及语义源实现 → PASS'), r.stdout);
});
