// SPDX-License-Identifier: Apache-2.0

/**
 * Reverse-proof for scripts/check-tag-lineage.mjs (node:test, zero dependencies).
 *
 * The gate exists because a tag cannot be taken back: v1.22.0 was cut from a commit that was not on main
 * and whose CI had never run. A gate like that is only worth something if each of its reds has been seen
 * red — until this file it had only ever been seen green. Every case below runs the real script against a
 * real temporary git repository; only `gh` is replaced, through the script's documented test seam
 * (KEELBASE_TAG_LINEAGE_GH), so nothing here touches the network or a real tag.
 *
 * Covered:
 *   1  the tag's commit is not on main                         → exit 1, names the tag and "not on main"
 *   2  on main, but no completed successful run                → exit 1, names "no completed successful"
 *   2b on main, but the run concluded failure / is in progress → exit 1
 *   0  on main with a green run                                → exit 0 (the positive control)
 *   2  no tag, unknown tag, unreadable gh, unreadable JSON,
 *      unreadable ancestry                                     → exit 2
 *
 * Run: node --test scripts/check-tag-lineage.test.mjs
 *
 * —— 中文 ——
 * `scripts/check-tag-lineage.mjs` 的反向证明（node:test，零依赖）。
 *
 * 这道门存在的原因是 tag 收不回来：v1.22.0 打在了既不在 main、CI 也从没跑过的提交上。这样的门，只有
 * 每一种红都真的见过红才算数 —— 在本文件之前它只见过绿。下列每个用例都用**真实临时 git 仓库**跑真实
 * 脚本；只有 `gh` 被替换，走脚本注明的测试缝（KEELBASE_TAG_LINEAGE_GH），因此不联网、不依赖真 tag。
 *
 * 覆盖：
 *   1  tag 的提交不在 main 上                      → 退出 1，点名该 tag 与「not on main」
 *   2  在 main 上，但没有已完成且成功的运行         → 退出 1，点名「no completed successful」
 *   2b 在 main 上，但运行结论为失败 / 仍在进行中     → 退出 1
 *   0  在 main 上且有绿的运行                      → 退出 0（正向对照）
 *   2  无 tag、未知 tag、gh 读不出、JSON 读不出、
 *      祖先关系读不出                              → 退出 2
 *
 * 运行：node --test scripts/check-tag-lineage.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-tag-lineage.mjs');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};
// The script falls back to GITHUB_REF_NAME when --tag is absent, and CI sets it for real. Drop it so the
// "no tag" case tests the script rather than the runner's environment.
// 脚本在没有 --tag 时回退到 GITHUB_REF_NAME，而 CI 里它确实有值。删掉它，让「无 tag」用例测的是脚本
// 本身，而不是跑测试那个环境。
delete GIT_ENV.GITHUB_REF_NAME;
delete GIT_ENV.GITHUB_REF;

let workDir;
let repo;
let shaOnMain;
let shaOffMain;
let ghFixture;

const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'kb-tag-lineage-'));
  repo = join(workDir, 'repo');
  git(['init', '-q', '-b', 'main', repo]);

  writeFileSync(join(repo, 'a.txt'), 'a\n', 'utf8');
  git(['-C', repo, 'add', '--', 'a.txt']);
  git(['-C', repo, 'commit', '-q', '-m', 'on main']);
  shaOnMain = git(['-C', repo, 'rev-parse', 'HEAD']);
  git(['-C', repo, 'tag', 'v1.2.3']);

  git(['-C', repo, 'checkout', '-q', '-b', 'feature']);
  writeFileSync(join(repo, 'b.txt'), 'b\n', 'utf8');
  git(['-C', repo, 'add', '--', 'b.txt']);
  git(['-C', repo, 'commit', '-q', '-m', 'off main']);
  shaOffMain = git(['-C', repo, 'rev-parse', 'HEAD']);
  git(['-C', repo, 'tag', 'v9.9.9']);

  git(['-C', repo, 'checkout', '-q', 'main']);

  // The fake `gh`: it answers `run list` from FAKE_GH_RUNS, exits with FAKE_GH_EXIT, and records its
  // arguments so a case can prove gh was — or was not — consulted.
  // 假 `gh`：用 FAKE_GH_RUNS 回答 `run list`，按 FAKE_GH_EXIT 退出，并记下自己的参数，使用例能证明
  // gh 到底被问了没有。
  ghFixture = join(workDir, 'gh-fixture.mjs');
  writeFileSync(
    ghFixture,
    [
      'import { appendFileSync } from "node:fs"',
      'const log = process.env.FAKE_GH_LOG',
      'if (log) appendFileSync(log, process.argv.slice(2).join(" ") + "\\n")',
      'const code = Number(process.env.FAKE_GH_EXIT || "0")',
      'if (code !== 0) { process.stderr.write("fake gh failed\\n"); process.exit(code) }',
      'process.stdout.write(process.env.FAKE_GH_RUNS || "[]")',
      '',
    ].join('\n'),
    'utf8',
  );
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

let logSeq = 0;
const runGate = (args, env = {}) => {
  const log = join(workDir, `gh-${++logSeq}.log`);
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...GIT_ENV, KEELBASE_TAG_LINEAGE_GH: ghFixture, FAKE_GH_LOG: log, ...env },
  });
  return { ...r, ghLog: existsSync(log) ? readFileSync(log, 'utf8').trim() : '' };
};

const onMainArgs = (extra = []) => ['--root', repo, '--tag', 'v1.2.3', '--main', 'main', ...extra];

test('a tag on a commit that is not on main is red and names both the tag and "not on main" — 不在 main 上的 tag 判红，并点名 tag 与 "not on main"', () => {
  const r = runGate(['--root', repo, '--tag', 'v9.9.9', '--main', 'main']);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /FAIL /);
  assert.match(r.stderr, new RegExp(`v9\\.9\\.9 \\(${shaOffMain.slice(0, 12)}\\) is not on main`));
  assert.equal(r.ghLog, '', 'ancestry failure must be decided before gh is consulted');
});

test('on main but with no completed successful run is red — 在 main 上但没有已完成且成功的运行，判红', () => {
  const r = runGate(onMainArgs(), { FAKE_GH_RUNS: '[]' });
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /FAIL /);
  assert.match(r.stderr, /no completed successful CI run/);
  assert.match(
    r.ghLog,
    new RegExp(`^run list --commit ${shaOnMain} --workflow CI --limit 20 --json status,conclusion$`),
    'gh must be asked about the tagged commit and the named workflow',
  );
});

test('on main with only a failed or unfinished run is red — 在 main 上但只有失败或未完成的运行，判红', () => {
  for (const runs of [
    '[{"status":"completed","conclusion":"failure"}]',
    '[{"status":"completed","conclusion":"cancelled"}]',
    '[{"status":"in_progress","conclusion":null}]',
  ]) {
    const r = runGate(onMainArgs(), { FAKE_GH_RUNS: runs });
    assert.equal(r.status, 1, `${runs}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /no completed successful CI run/, runs);
  }
});

test('on main with a green run is green — 在 main 上且有绿的运行，判绿', () => {
  const r = runGate(onMainArgs(), {
    FAKE_GH_RUNS: '[{"status":"completed","conclusion":"success"}]',
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /OK /);
  assert.match(r.stderr, /is on main and has a green CI run/);
});

test('no tag at all is exit 2 — 完全没给 tag 时退出 2', () => {
  const r = runGate(['--root', repo]);
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /UNKNOWN /);
  assert.match(r.stderr, /no --tag/);
});

test('an unknown tag is exit 2 — 未知 tag 退出 2', () => {
  const r = runGate(['--root', repo, '--tag', 'v0.0.1', '--main', 'main']);
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /no such tag: v0\.0\.1/);
});

test('gh failing is exit 2, not a silent pass — gh 失败时退出 2，而不是静默放过', () => {
  const r = runGate(onMainArgs(), { FAKE_GH_EXIT: '1' });
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /UNKNOWN /);
  assert.match(r.stderr, /cannot read CI runs/);
});

test('gh returning unreadable JSON is exit 2 — gh 返回读不出的 JSON 时退出 2', () => {
  const r = runGate(onMainArgs(), { FAKE_GH_RUNS: 'not json' });
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /unreadable JSON/);
});

test('a --main that does not resolve is exit 2 — --main 解析不出时退出 2', () => {
  const r = runGate(['--root', repo, '--tag', 'v1.2.3', '--main', 'no-such-branch']);
  assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /cannot read ancestry/);
});
