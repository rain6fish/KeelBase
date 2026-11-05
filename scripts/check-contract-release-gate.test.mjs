// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for scripts/check-contract-release-gate.mjs (node:test, zero dependencies).
 *
 * The gate exists because a release could claim a contract capability nobody implements. These cases
 * build a throwaway consumer tree, contract repository (with a real bare remote) and Java repository,
 * then run the real script against them. Both directions are covered: a claim with an implementer must
 * pass, or the gate would be a permanent red nobody reads, and a claim without one must fail, or the
 * gate would not be doing its job.
 *
 * Run: node --test scripts/check-contract-release-gate.test.mjs
 *
 * `scripts/check-contract-release-gate.mjs` 的测试（node:test，零依赖）。
 *
 * 本闸的存在，是因为发布可以声称一个没人实现的契约能力。下列用例搭一棵一次性的消费方树、契约仓
 * （带真的 bare 远端）与 Java 仓，然后对它们跑**真脚本**。两个方向都覆盖：有实现方的声称必须通过，
 * 否则这道闸会变成没人看的常红；没有实现方的声称必须失败，否则它没有在干活。
 *
 * 运行：node --test scripts/check-contract-release-gate.test.mjs
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

const MEMBERSHIP_SCHEMAS = [
  'schemas/v3/audit-chain-verification.schema.json',
  'schemas/v3/audit-action-report.schema.json',
];
const MEMBERSHIP_FIELDS = ['tableIds', 'verifiedIds', 'unverifiedIds', 'unaccounted'];

let workDir;
let seq = 0;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'kb-contract-release-gate-'));
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
};

function write(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, 'utf8');
}

function writeReadmes(root, version) {
  write(
    join(root, 'README.md'),
    `# Fixture\n\n| Project | Line | Contract |\n|---|---|---|\n| \`KeelBase\` (TypeScript) | \`main\`, **unreleased** | **${version}** — bound as a submodule |\n`,
  );
  write(
    join(root, 'README.zh-CN.md'),
    `# 夹具\n\n| 项目 | 线 | 契约 |\n|---|---|---|\n| **KeelBase**（TypeScript） | \`main\`，**未发布** | **${version}**——以 submodule 绑定 |\n`,
  );
}

/**
 * A world with a consumer tree, a contract repository and a Java repository.
 *
 * `membershipInRelease` puts the v3 schemas in the claimed tag's tree; `membershipInPin` puts them in
 * a commit after it (the pin drags them in). `javaImplemented` decides whether Java carries the
 * fields and the vendored schema. `origin`, `pushTags` and `fromPreviousTag` remove one leg each.
 *
 * 一个带消费方树、契约仓与 Java 仓的世界。
 *
 * `membershipInRelease` 把 v3 schema 放进声称 tag 的树；`membershipInPin` 放进它之后的一笔提交
 * （pin 把它们拖进来）。`javaImplemented` 决定 Java 是否带字段与 vendored schema。`origin`、
 * `pushTags`、`fromPreviousTag` 各拆掉一条腿。
 */
function makeWorld({
  claim = 'v1.1.0',
  membershipInRelease = false,
  membershipInPin = false,
  javaImplemented = false,
  origin = true,
  pushTags = true,
  fromPreviousTag = true,
} = {}) {
  const base = join(workDir, `world-${(seq += 1)}`);
  const root = join(base, 'consumer');
  const contract = join(root, ...SUB.split('/'));
  const java = join(base, 'java');
  const remote = join(base, 'remote.git');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(contract, { recursive: true });
  mkdirSync(java, { recursive: true });

  cpSync(join(HERE, 'check-contract-release-gate.mjs'), join(root, 'scripts', 'check-contract-release-gate.mjs'));
  writeReadmes(root, claim);

  // Contract: v1.0.0 baseline, v1.1.0 release, optional pin-ahead commit.
  // 契约：v1.0.0 基线，v1.1.0 发布，可选一笔 pin 领先提交。
  git(contract, ['init', '-q', '-b', 'main']);
  write(join(contract, 'README.md'), 'contract v1.0.0\n');
  git(contract, ['add', '-A']);
  git(contract, ['commit', '-q', '-m', 'v1.0.0']);
  git(contract, ['tag', 'v1.0.0']);

  if (fromPreviousTag) {
    write(join(contract, 'CHANGELOG.md'), 'v1.1.0\n');
    if (membershipInRelease) for (const s of MEMBERSHIP_SCHEMAS) write(join(contract, s), '{"fixture":true}\n');
    git(contract, ['add', '-A']);
    git(contract, ['commit', '-q', '-m', 'v1.1.0']);
  } else {
    // An orphan release commit: the same version name, but not cut from the previous tag.
    // 一个孤儿发布提交：同样的版本名，但不是从上一个 tag 切出的。
    git(contract, ['checkout', '-q', '--orphan', 'detached-release']);
    git(contract, ['rm', '-rf', '--cached', '.']);
    rmSync(join(contract, 'README.md'), { force: true });
    write(join(contract, 'CHANGELOG.md'), 'orphan v1.1.0\n');
    git(contract, ['add', '-A']);
    git(contract, ['commit', '-q', '-m', 'orphan v1.1.0']);
  }
  git(contract, ['tag', claim]);

  if (membershipInPin) {
    for (const s of MEMBERSHIP_SCHEMAS) write(join(contract, s), '{"fixture":true}\n');
    git(contract, ['add', '-A']);
    git(contract, ['commit', '-q', '-m', 'pin ahead']);
  }

  if (origin) {
    git(workDir, ['init', '-q', '--bare', remote]);
    git(contract, ['remote', 'add', 'origin', remote]);
    git(contract, ['push', '-q', 'origin', 'HEAD:refs/heads/main']);
    if (pushTags) git(contract, ['push', '-q', 'origin', '--tags']);
  }

  // Java: the implementing DTO and the vendored snapshot, when the fixture says it is implemented.
  // Java：夹具说已实现时，给出承载字段的 DTO 与 vendored 快照。
  git(java, ['init', '-q', '-b', 'main']);
  write(join(java, 'README.md'), 'java fixture\n');
  if (javaImplemented) {
    write(
      join(java, 'src/main/java/example/ChainVerificationDto.java'),
      `package example;\n\npublic class ChainVerificationDto {\n${MEMBERSHIP_FIELDS.map((f) => `    private String ${f};`).join('\n')}\n}\n`,
    );
    for (const s of MEMBERSHIP_SCHEMAS) write(join(java, 'conformance/vectors', s), '{"fixture":true}\n');
  }
  git(java, ['add', '-A']);
  git(java, ['commit', '-q', '-m', 'java fixture']);

  return { root, java };
}

const run = ({ root, java }) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'check-contract-release-gate.mjs'), '--java', java], {
    cwd: root,
    encoding: 'utf8',
  });

test('a claim with an implementer passes: exit 0 / 有实现方的声称通过：退出 0', () => {
  const world = makeWorld({ membershipInRelease: true, javaImplemented: true });
  const r = run(world);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /C5 声称的能力都有实现方/);
  assert.match(r.stdout, /PASS/);
});

test('a claim without an implementer fails, naming the missing fields: exit 1 / 没有实现方的声称失败，并点名缺失字段：退出 1', () => {
  const world = makeWorld({ membershipInRelease: true, javaImplemented: false });
  const r = run(world);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /audit-membership-v3/);
  assert.match(r.stdout, /tableIds/);
  assert.match(r.stdout, /Java 快照：缺/);
  assert.match(r.stderr, /FAIL/);
});

test('a pin that drags a parked capability in fails: exit 1 / pin 把暂缓能力拖进来：退出 1', () => {
  const world = makeWorld({ membershipInPin: true, javaImplemented: false });
  const r = run(world);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /C3/);
  assert.match(r.stdout, /暂缓能力/);
});

test('an unreadable remote is UNVERIFIED, not skipped: exit 1 / 远端读不出是未核验、不是跳过：退出 1', () => {
  const world = makeWorld({ origin: false });
  const r = run(world);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /无法核验 \/ UNVERIFIED/);
  assert.match(r.stdout, /no `origin` remote/);
});

test('a tag that never reached the remote fails: exit 1 / 没到远端的 tag 失败：退出 1', () => {
  const world = makeWorld({ pushTags: false });
  const r = run(world);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /只在本地，远端没有/);
});

test('a release not cut from the previous tag fails: exit 1 / 不是从上一个 tag 切出的发布失败：退出 1', () => {
  const world = makeWorld({ fromPreviousTag: false });
  const r = run(world);
  assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /不是从 v1\.0\.0 切出的/);
});
