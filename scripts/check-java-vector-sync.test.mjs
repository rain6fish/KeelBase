// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for the Java-side ref selection in check-java-vector-sync.mjs (node:test, zero
 * dependencies). A shared checkout parked on another branch used to mask vector drift because the gate
 * compared the Java working tree; the fix reads `main`, falling back to `HEAD`, and the cases below pin
 * that choice so it cannot silently regress.
 *
 * Every fixture is a throwaway git repository under the OS temp directory, built from this repository's
 * own corpus. The tests never touch a real Java checkout and never use the network.
 *
 * Run: node --test scripts/check-java-vector-sync.test.mjs
 *
 * 回归测试：check-java-vector-sync.mjs 的 Java 侧 ref 选择（node:test，零依赖）。共用检出停在别的分支时，
 * 旧写法比对 Java 工作树，会遮蔽向量漂移；修复改为读 `main`、没有则回落 `HEAD`，下列用例把这一选择钉住，
 * 防止悄悄回退。
 *
 * 每个 fixture 都是操作系统临时目录下的一次性 git 仓，语料取自本仓自身。测试不碰真实 Java 检出，也不联网。
 *
 * 运行：node --test scripts/check-java-vector-sync.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(HERE, 'check-java-vector-sync.mjs');
const CORPUS = join(ROOT, 'Server-NestJS/specs/protocol');

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

/**
 * Copy this repository's vector files and schema tree into a fixture's `conformance/vectors`, optionally
 * leaving out whole schema version directories (simulating an older Java snapshot).
 * 把本仓的向量文件与 schema 树复制到 fixture 的 `conformance/vectors`；可整目录跳过某些 schema 版本
 * （模拟更旧的 Java 快照）。
 */
const copyCorpus = (fixtureDir, { omitSchemaDirs = [] } = {}) => {
  const vectorsDir = join(fixtureDir, 'conformance/vectors');
  const schemasDir = join(vectorsDir, 'schemas');
  mkdirSync(schemasDir, { recursive: true });

  for (const entry of readdirSync(CORPUS, { withFileTypes: true })) {
    if (entry.isFile() && /-vector\.json$/.test(entry.name)) {
      copyFileSync(join(CORPUS, entry.name), join(vectorsDir, entry.name));
    }
  }
  for (const entry of readdirSync(join(CORPUS, 'schemas'), { withFileTypes: true })) {
    if (entry.isDirectory() && omitSchemaDirs.includes(entry.name)) continue;
    cpSync(join(CORPUS, 'schemas', entry.name), join(schemasDir, entry.name), { recursive: true });
  }
};

const run = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

let fixtureDir;
let noMainDir;
let oldCommit;

before(() => {
  assert.ok(
    existsSync(join(CORPUS, 'schemas/v6/evidence-package.schema.json')),
    `corpus missing at ${CORPUS} — the contract submodule must be checked out`,
  );

  // One fixture, two commits: an older snapshot without v3/v6, then the complete one. `main` points at
  // the complete commit; branch `old` points at the older one.
  // 同一个 fixture 两个提交：先旧快照（缺 v3/v6），再完整快照。`main` 指完整提交，分支 `old` 指旧提交。
  fixtureDir = mkdtempSync(join(tmpdir(), 'kb-java-vectors-'));
  copyCorpus(fixtureDir, { omitSchemaDirs: ['v3', 'v6'] });
  mustGit(fixtureDir, 'init', '-q', '-b', 'main');
  mustGit(fixtureDir, 'add', '--', 'conformance');
  mustGit(fixtureDir, 'commit', '-q', '-m', 'old snapshot without v3/v6');
  oldCommit = mustGit(fixtureDir, 'rev-parse', 'HEAD');

  copyCorpus(fixtureDir);
  mustGit(fixtureDir, 'add', '--', 'conformance');
  mustGit(fixtureDir, 'commit', '-q', '-m', 'complete snapshot');
  mustGit(fixtureDir, 'branch', 'old', oldCommit);

  // A repository with no `main` at all: a single branch, then detached HEAD — the shape CI checks out.
  // 没有 `main` 的仓：单分支提交后切到 detached HEAD —— 正是 CI 的检出形状。
  noMainDir = mkdtempSync(join(tmpdir(), 'kb-java-vectors-detached-'));
  copyCorpus(noMainDir);
  mustGit(noMainDir, 'init', '-q', '-b', 'fixture');
  mustGit(noMainDir, 'add', '--', 'conformance');
  mustGit(noMainDir, 'commit', '-q', '-m', 'complete snapshot');
  mustGit(noMainDir, 'checkout', '-q', '--detach', 'HEAD');
});

after(() => {
  for (const dir of [fixtureDir, noMainDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

test('auto: a fixture with main and the full corpus is green and reports ref=main — 有 main 且语料完整 ⇒ 绿，输出 ref=main', () => {
  const r = run('--java', fixtureDir);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ref=main/);
  assert.match(r.stdout, /✓ 跨仓语料一致/);
});

test('auto: an older ref missing v3/v6 is red (exit 1) and names the gaps — 旧 ref 缺 v3/v6 ⇒ 红、退出 1 并点名缺失', () => {
  const r = run('--java', fixtureDir, '--java-ref', 'old');
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ref=old/);
  assert.match(r.stdout, /主仓独有（Java 快照缺）/);
  assert.match(r.stdout, /v3\//);
  assert.match(r.stdout, /v6\//);
  assert.match(r.stderr, /跨仓漂移未通过/);
});

test('--allow-missing: the same older ref is green, gap reported as a warning — 同一旧 ref 加 --allow-missing ⇒ 绿，缺口降级为警告', () => {
  const r = run('--java', fixtureDir, '--java-ref', 'old', '--allow-missing');
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /⚠ 主仓独有（Java 快照缺）/);
  assert.match(r.stdout, /已按 --allow-missing 放行/);
});

test('auto: no main ref falls back to HEAD and stays green — 无 main 时回落 HEAD 且绿', () => {
  const r = run('--java', noMainDir);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /ref=HEAD/);
  assert.doesNotMatch(r.stdout, /ref=main/);
  assert.match(r.stdout, /✓ 跨仓语料一致/);
});

test('--sync with --java-ref is refused (exit 2) — --sync 与 --java-ref 同用 ⇒ 退出 2', () => {
  const r = run('--java', fixtureDir, '--sync', '--java-ref', 'main');
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /不能与 --java-ref 同用/);
});

test('a bad --java-ref is refused (exit 2) — 坏 ref ⇒ 退出 2', () => {
  const r = run('--java', fixtureDir, '--java-ref', 'no-such-ref');
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /没有 ref/);
});
