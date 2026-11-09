// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for scripts/check-compose-digests.mjs (node:test, zero dependencies).
 *
 * Both directions, because either one alone would leave the gate worthless: a floating tag must go red and
 * name its file and line, or the gate repeats the state it was written to end; a digest-pinned entry must
 * go green, or the gate becomes a permanent red nobody reads. Each case builds a throwaway compose tree and
 * runs the real script against it, so the exit code asserted here is the exit code CI gets.
 *
 * Run: node --test scripts/check-compose-digests.test.mjs
 *
 * `scripts/check-compose-digests.mjs` 的测试（node:test，零依赖）。
 *
 * 两个方向都要，缺一个闸就废了：浮动标签必须判红并点名文件与行号，否则本闸只是在重演它要终结的那个状态；
 * 按摘要钉住的条目必须判绿，否则它会变成没人看的常红。每个用例搭一棵一次性编排树，对它们跑**真脚本**，
 * 于是这里断言的退出码就是 CI 拿到的退出码。
 *
 * 运行：node --test scripts/check-compose-digests.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-compose-digests.mjs');
const DIGEST = 'sha256:' + 'a'.repeat(64);

function run(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-compose-digests-'));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    const r = spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const compose = (...lines) => `services:\n  svc:\n${lines.map((l) => `    ${l}`).join('\n')}\n`;

test('a floating tag goes red, naming the file and line', () => {
  const r = run({ 'docker-compose.yml': compose('image: redis:7-alpine') });
  assert.equal(r.status, 1);
  assert.match(r.out, /docker-compose\.yml:3/);
  assert.match(r.out, /redis:7-alpine/);
});

test('a digest-pinned image goes green', () => {
  const r = run({ 'docker-compose.yml': compose(`image: redis:7-alpine@${DIGEST}`) });
  assert.equal(r.status, 0);
  assert.match(r.out, /全部按摘要钉住/);
});

test('a commented-out floating entry is not an entry', () => {
  const r = run({
    'docker-compose.yml': compose(`# image: redis:7-alpine`, `image: redis:7-alpine@${DIGEST}`),
  });
  assert.equal(r.status, 0);
});

test('a malformed digest is red — presence alone is not pinning', () => {
  const r = run({ 'docker-compose.yml': compose('image: redis:7-alpine@sha256:abc123') });
  assert.equal(r.status, 1);
  assert.match(r.out, /redis:7-alpine@sha256:abc123/);
});

test('every compose file is scanned, not just the first', () => {
  const r = run({
    'docker-compose.yml': compose(`image: redis:7-alpine@${DIGEST}`),
    'docker-compose.observability.yml': compose('image: grafana/grafana:latest'),
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /docker-compose\.observability\.yml:3/);
  assert.doesNotMatch(r.out, /✗ docker-compose\.yml/);
});

test('no compose file at all is red — a gate that scanned nothing must not read as green', () => {
  const r = run({ 'README.md': 'not a compose tree\n' });
  assert.equal(r.status, 1);
  assert.match(r.out, /no docker-compose\*\.yml/);
});
