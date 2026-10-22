// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for scripts/wait-for-contract-ref.sh (node:test, zero dependencies).
 *
 * The script exists because a consumer's CI can outrun the contract repository's tag push. Its whole
 * value is the *bound*: it must return as soon as the ref is visible, keep probing while it is not,
 * and give up on both caps (probe count and wall clock) without ever pretending the ref exists. The
 * cases below pin those three behaviours, plus the usage error. A final case runs the real `git`
 * against a local bare remote, so the fake-git seam cannot hide a broken invocation.
 *
 * Run: node --test scripts/wait-for-contract-ref.test.mjs
 *
 * wait-for-contract-ref.sh 的测试（node:test，零依赖）。
 *
 * 这个脚本存在的原因是消费方 CI 可能跑在契约仓 tag 推送之前。它的全部价值在**有界**：ref 一可见就必须立即
 * 返回；不可见时要继续探测；两种上限（探测次数与墙钟时长）都到点就放弃，绝不允许假装 ref 存在。下列用例把
 * 这三件事钉住，另加用法错误。最后一个用例用**真实 git** 对本地裸仓跑一遍，避免「假 git 缝」掩盖调用写错。
 *
 * 运行：node --test scripts/wait-for-contract-ref.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'wait-for-contract-ref.sh');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};

let workDir;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'kb-wait-contract-ref-'));
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

/**
 * Write a fake `git` that answers `ls-remote` with the ref only from the Nth call on, and counts its
 * calls in a per-test file. Deterministic by construction: no sleeps, no network.
 * 写一个假 `git`：从第 N 次调用起才在 `ls-remote` 里给出该 ref，并把调用次数记进每用例独立的文件。
 * 构造上就是确定性的：不 sleep、不联网。
 */
const makeFakeGit = (name) => {
  const counter = join(workDir, `${name}.calls`);
  const fake = join(workDir, `${name}.git`);
  // Plain array-join rather than a template literal: the fake is bash, and `${...}` must survive.
  // 用数组拼接而非模板字符串：假 git 是 bash，`${...}` 必须原样保留。
  writeFileSync(
    fake,
    [
      '#!/usr/bin/env bash',
      'set -u',
      'n=0',
      'if [ -f "$FAKE_GIT_COUNTER" ]; then n=$(cat "$FAKE_GIT_COUNTER"); fi',
      'n=$((n + 1))',
      `printf '%s' "$n" > "$FAKE_GIT_COUNTER"`,
      'if [ "$n" -ge "${FAKE_GIT_VISIBLE_AT:-1}" ]; then',
      `  printf '0123456789abcdef0123456789abcdef01234567\\trefs/tags/v9.9.9\\n'`,
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf8',
  );
  chmodSync(fake, 0o755);
  return { fake, counter };
};

const calls = (counter) => (existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0);

const run = (args, env = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...GIT_ENV, ...env },
  });

const fakeArgs = ({ fake, counter }, extra = []) => [
  '--ref',
  'refs/tags/v9.9.9',
  '--git',
  fake,
  '--interval',
  '0',
  '--attempts',
  '5',
  '--max-seconds',
  '30',
  ...extra,
];

test('visible on the first probe: exit 0 and stop probing — 第一次探测即可见：退出 0 且不再探测', () => {
  const f = makeFakeGit('immediate');
  const r = run(fakeArgs(f), { FAKE_GIT_COUNTER: f.counter, FAKE_GIT_VISIBLE_AT: '1' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(calls(f.counter), 1, 'must not probe again once the ref is visible');
  assert.match(r.stdout, /is visible on origin \(probe 1\)/);
});

test('invisible, then visible: exit 0 on the third probe — 先不可见后可见：第三次探测退出 0', () => {
  const f = makeFakeGit('late');
  const r = run(fakeArgs(f), { FAKE_GIT_COUNTER: f.counter, FAKE_GIT_VISIBLE_AT: '3' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.equal(calls(f.counter), 3);
  assert.match(r.stdout, /probe 3/);
});

test('never visible: the probe cap stops it with exit 1 — 始终不可见：探测次数封顶后退出 1', () => {
  const f = makeFakeGit('never');
  const r = run(fakeArgs(f, ['--attempts', '3']), {
    FAKE_GIT_COUNTER: f.counter,
    FAKE_GIT_VISIBLE_AT: '99',
  });
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.equal(calls(f.counter), 3, 'attempts cap must be honoured');
  assert.match(r.stderr, /giving up/);
});

test('never visible: the wall-clock cap stops it before the probe cap — 始终不可见：墙钟封顶先于次数封顶生效', () => {
  const f = makeFakeGit('clock');
  const r = run(fakeArgs(f, ['--attempts', '999', '--max-seconds', '0']), {
    FAKE_GIT_COUNTER: f.counter,
    FAKE_GIT_VISIBLE_AT: '99',
  });
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.equal(calls(f.counter), 1, 'a zero budget must not loop');
});

test('missing --ref is a usage error (exit 2) — 缺 --ref 是用法错误（退出 2）', () => {
  const r = run(['--repo', '.']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test('real git: a tag on a local bare remote is seen, a missing tag is not — 真实 git：本地裸仓上的 tag 看得见，缺的看不见', () => {
  const bare = join(workDir, 'remote.git');
  const work = join(workDir, 'work');
  const must = (args) => {
    const r = spawnSync('git', args, { encoding: 'utf8', env: GIT_ENV });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  must(['init', '--bare', '-q', bare]);
  must(['init', '-q', '-b', 'main', work]);
  writeFileSync(join(work, 'README.md'), 'fixture\n', 'utf8');
  must(['-C', work, 'add', '--', 'README.md']);
  must(['-C', work, 'commit', '-q', '-m', 'fixture']);
  must(['-C', work, 'tag', 'v1.2.3']);
  must(['-C', work, 'remote', 'add', 'origin', bare]);
  must(['-C', work, 'push', '-q', 'origin', 'v1.2.3']);

  const ok = run(['--repo', work, '--remote', 'origin', '--ref', 'refs/tags/v1.2.3', '--max-seconds', '30']);
  assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
  assert.match(ok.stdout, /is visible on origin/);

  const missing = run([
    '--repo',
    work,
    '--remote',
    'origin',
    '--ref',
    'refs/tags/v1.2.4',
    '--attempts',
    '2',
    '--interval',
    '0',
    '--max-seconds',
    '30',
  ]);
  assert.equal(missing.status, 1, `${missing.stdout}\n${missing.stderr}`);
  assert.match(missing.stderr, /refs\/tags\/v1\.2\.4 is still not visible/);
});
