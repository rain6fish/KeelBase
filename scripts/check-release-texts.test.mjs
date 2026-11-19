// SPDX-License-Identifier: Apache-2.0

/**
 * Reverse-proof for scripts/check-release-texts.mjs (node:test, zero dependencies).
 *
 * The gate exists because v1.4.2 shipped a user-visible security fix that was in the tagged tree and in
 * no release text. A gate like that is only worth something once each of its reds has been seen red; every
 * case below runs the real script against a real temporary git repository, so nothing here depends on the
 * network or on this checkout's history.
 *
 * Covered:
 *   1  product commits with no entry, and test/doc/provenance/merge commits without one → exit 1, names
 *      the product commits only (the exclusions are proven by their absence)
 *   0  every product commit listed (abbreviated shas allowed)                          → exit 0
 *   1  a stale entry for a commit outside the range                                    → exit 1
 *   1  a malformed entry (unknown kind, internal without reason, user-visible without text) → exit 1
 *   2  unreadable table, unreadable JSON, unresolvable tip, both modes at once         → exit 2
 *   0  tag body equal to the notes file (CRLF and trailing newlines forgiven)          → exit 0
 *   1  tag body differing from the notes file                                          → exit 1, first differing line
 *   2  lightweight tag, unknown tag, missing notes file                                → exit 2
 *
 * Run: node --test scripts/check-release-texts.test.mjs
 *
 * —— 中文 ——
 * `scripts/check-release-texts.mjs` 的反向证明（node:test，零依赖）。
 *
 * 这道门存在的原因是 v1.4.2 发出去时带了一笔用户可见的安全修复，它在被 tag 的树里、却不在任何发布
 * 文本里。这样的门，只有每一种红都真的见过红才算数；下列每个用例都用**真实临时 git 仓库**跑真实脚本，
 * 因此不联网、也不依赖本检出的历史。
 *
 * 覆盖：
 *   1  有产品提交没条目，而仅测试/文档/provenance/合并提交无需条目 → 退出 1，且只点名产品提交
 *      （排除规则由「它们没被点名」证得）
 *   0  每个产品提交都有条目（允许缩写 sha）                        → 退出 0
 *   1  覆盖表里有一笔区间外的提交（陈旧）                          → 退出 1
 *   1  条目不合规（kind 未知、internal 无 reason、user-visible 无 text）→ 退出 1
 *   2  覆盖表读不出、JSON 非法、tip 解析不出、同时给两种模式        → 退出 2
 *   0  tag 正文等于说明文件（CRLF 与末尾换行从宽）                  → 退出 0
 *   1  tag 正文与说明文件不同                                       → 退出 1，报首个差异行
 *   2  轻量 tag、未知 tag、说明文件不存在                           → 退出 2
 *
 * 运行：node --test scripts/check-release-texts.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-release-texts.mjs');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};

let workDir;
let repo;
const sha = {};

const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

const write = (file, text) => {
  const path = join(repo, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
};

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'kb-release-texts-'));
  repo = join(workDir, 'repo');
  git(['init', '-q', '-b', 'main', repo]);

  write('README.md', 'root\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'initial']);
  sha.beforeTag = git(['-C', repo, 'rev-parse', 'HEAD']);
  git(['-C', repo, 'tag', 'v1.0.0']);

  // A product commit: must be covered.
  write('Server-NestJS/src/feature.ts', 'export const a = 1\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'feat: a product change']);
  sha.product = git(['-C', repo, 'rev-parse', 'HEAD']);

  // Test-only, doc-only and provenance-only commits under product paths: no entry needed.
  write('Server-NestJS/src/feature.spec.ts', 'test\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'test: a spec']);
  sha.testOnly = git(['-C', repo, 'rev-parse', 'HEAD']);

  write('Server-NestJS/src/notes.md', 'doc\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'docs: a note']);
  sha.docOnly = git(['-C', repo, 'rev-parse', 'HEAD']);

  write('Server-NestJS/src/books/.keelbase-provenance.json', '{}\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'chore: provenance']);
  sha.provenanceOnly = git(['-C', repo, 'rev-parse', 'HEAD']);

  // A second product commit on a side branch, so the merge below has something to bring in.
  git(['-C', repo, 'checkout', '-q', '-b', 'side']);
  write('Web-Admin-Vue/src/view.vue', '<template />\n');
  git(['-C', repo, 'add', '--all']);
  git(['-C', repo, 'commit', '-q', '-m', 'fix: a web change']);
  sha.sideProduct = git(['-C', repo, 'rev-parse', 'HEAD']);

  git(['-C', repo, 'checkout', '-q', 'main']);
  git(['-C', repo, 'merge', '-q', '--no-ff', 'side', '-m', 'merge: side']);
  sha.tip = git(['-C', repo, 'rev-parse', 'HEAD']);

  // Annotated tag whose body must equal the notes file below.
  writeFileSync(join(workDir, 'notes.md'), 'v2 — title / 标题\n\nHighlights\n\n* one\n* two\n', 'utf8');
  git(['-C', repo, 'tag', '-a', 'v2.0.0', '-F', join(workDir, 'notes.md')]);
  git(['-C', repo, 'tag', 'light']);
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

let seq = 0;
const runScript = (args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: GIT_ENV });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

const writeTable = (entries) => {
  const path = join(workDir, `coverage-${++seq}.json`);
  writeFileSync(path, JSON.stringify(entries), 'utf8');
  return path;
};

const coverageArgs = (table) => [
  '--root',
  repo,
  '--prev-tag',
  'v1.0.0',
  '--tip',
  sha.tip,
  '--coverage',
  table,
];

const covered = (shaValue, extra = {}) => ({ sha: shaValue, kind: 'user-visible', text: 'Highlights 1', ...extra });

test('product commits with no entry are red, and only product commits are named — 产品提交没有条目判红，且只点名产品提交', () => {
  const r = runScript(coverageArgs(writeTable([])));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL /);
  assert.match(r.out, new RegExp(`uncovered ${sha.product.slice(0, 12)}`));
  assert.match(r.out, new RegExp(`uncovered ${sha.sideProduct.slice(0, 12)}`));
  for (const skipped of [sha.testOnly, sha.docOnly, sha.provenanceOnly, sha.tip]) {
    assert.doesNotMatch(r.out, new RegExp(`uncovered ${skipped.slice(0, 12)}`), `must not ask for ${skipped}`);
  }
  assert.match(r.out, /Server-NestJS\/src\/feature\.ts/, 'the uncovered commit names its product files');
});

test('every product commit listed is green, abbreviated shas accepted — 产品提交都列上即绿，允许缩写 sha', () => {
  const r = runScript(
    coverageArgs(
      writeTable([
        covered(sha.product.slice(0, 8)),
        covered(sha.sideProduct.slice(0, 7), { kind: 'internal', text: undefined, reason: 'no visible change' }),
      ]),
    ),
  );
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK /);
  assert.match(r.out, /2 product commit\(s\) all covered/);
  // Three: the test-only, doc-only and provenance-only commits. The merge commit is not counted at all.
  // 三笔：仅测试、仅文档、仅 provenance。合并提交完全不计入。
  assert.match(r.out, /3 test\/doc-only commit\(s\) need no entry/);
});

test('an entry for a commit outside the range is red as stale — 区间外的条目判陈旧红', () => {
  const r = runScript(
    coverageArgs(
      writeTable([covered(sha.product), covered(sha.sideProduct), covered(sha.beforeTag, { kind: 'docs' })]),
    ),
  );
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, new RegExp(`stale entry ${sha.beforeTag.slice(0, 12)}`));
  assert.doesNotMatch(r.out, /uncovered /);
});

test('malformed entries are red — 条目不合规判红', () => {
  const cases = [
    [{ sha: sha.product, kind: 'chore', text: 'x' }, /kind "chore" is not one of/],
    [{ sha: sha.product, kind: 'internal' }, /internal needs reason/],
    [{ sha: sha.product, kind: 'user-visible', text: '  ' }, /user-visible needs text/],
    [{ sha: 'not-a-sha', kind: 'docs' }, /is not a commit sha/],
  ];
  for (const [entry, expected] of cases) {
    const r = runScript(coverageArgs(writeTable([entry, covered(sha.sideProduct)])));
    assert.equal(r.status, 1, `${JSON.stringify(entry)}\n${r.out}`);
    assert.match(r.out, expected, JSON.stringify(entry));
  }
});

test('unreadable inputs are exit 2 — 输入读不出时退出 2', () => {
  const missing = runScript(coverageArgs(join(workDir, 'no-such.json')));
  assert.equal(missing.status, 2, missing.out);
  assert.match(missing.out, /UNKNOWN /);
  assert.match(missing.out, /cannot read the coverage table/);

  const badJson = join(workDir, 'bad.json');
  writeFileSync(badJson, '{ not json', 'utf8');
  assert.equal(runScript(coverageArgs(badJson)).status, 2);

  const noEntries = join(workDir, 'no-entries.json');
  writeFileSync(noEntries, '{"entries": 3}', 'utf8');
  assert.equal(runScript(coverageArgs(noEntries)).status, 2);

  const badTip = runScript(['--root', repo, '--prev-tag', 'v1.0.0', '--tip', 'nope', '--coverage', writeTable([])]);
  assert.equal(badTip.status, 2, badTip.out);
  assert.match(badTip.out, /cannot resolve --tip nope/);

  const both = runScript([...coverageArgs(writeTable([])), '--tag', 'v2.0.0', '--notes', join(workDir, 'notes.md')]);
  assert.equal(both.status, 2, both.out);
  assert.match(both.out, /one mode at a time/);

  const neither = runScript(['--root', repo]);
  assert.equal(neither.status, 2, neither.out);
  assert.match(neither.out, /no mode given/);
});

test('a tag body equal to the notes file is green, CRLF and trailing newlines forgiven — tag 正文与说明一致即绿，行尾与末尾换行从宽', () => {
  const exact = runScript(['--root', repo, '--tag', 'v2.0.0', '--notes', join(workDir, 'notes.md')]);
  assert.equal(exact.status, 0, exact.out);
  assert.match(exact.out, /OK /);
  assert.match(exact.out, /body equals/);

  const crlf = join(workDir, 'notes-crlf.md');
  writeFileSync(crlf, 'v2 — title / 标题\r\n\r\nHighlights\r\n\r\n* one\r\n* two\r\n\r\n', 'utf8');
  const sloppy = runScript(['--root', repo, '--tag', 'v2.0.0', '--notes', crlf]);
  assert.equal(sloppy.status, 0, sloppy.out);
});

test('a tag body that differs from the notes file is red and names the first differing line — 正文与说明不同判红，并报首个差异行', () => {
  const drifted = join(workDir, 'notes-drifted.md');
  writeFileSync(drifted, 'v2 — title / 标题\n\nHighlights\n\n* one\n* three\n', 'utf8');
  const r = runScript(['--root', repo, '--tag', 'v2.0.0', '--notes', drifted]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL /);
  assert.match(r.out, /differ at line 6/);
  assert.match(r.out, /file: "\* three"/);
  assert.match(r.out, /tag:  "\* two"/);
});

test('a lightweight or unknown tag, or a missing notes file, is exit 2 — 轻量 tag、未知 tag、说明文件缺失均退出 2', () => {
  const light = runScript(['--root', repo, '--tag', 'light', '--notes', join(workDir, 'notes.md')]);
  assert.equal(light.status, 2, light.out);
  assert.match(light.out, /is a commit, not an annotated tag/);

  const unknown = runScript(['--root', repo, '--tag', 'v9.9.9', '--notes', join(workDir, 'notes.md')]);
  assert.equal(unknown.status, 2, unknown.out);
  assert.match(unknown.out, /cannot read v9\.9\.9/);

  const noNotes = runScript(['--root', repo, '--tag', 'v2.0.0', '--notes', join(workDir, 'no-such.md')]);
  assert.equal(noNotes.status, 2, noNotes.out);
  assert.match(noNotes.out, /cannot read the notes file/);
});
