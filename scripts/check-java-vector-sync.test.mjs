// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for check-java-vector-sync.mjs (node:test, zero dependencies). Two kinds of case:
 *
 *  - Ref selection. A shared checkout parked on another branch used to mask vector drift because the
 *    gate compared the Java working tree; the fix reads `main`, falling back to `HEAD`, and these cases
 *    pin that choice so it cannot silently regress.
 *  - Reverse evidence. Criterion 3 (schema content) and criterion 4 (the explicit `/4` assertion) are
 *    proved by mutating a schema and requiring the gate to go red and name what changed — a gate nobody
 *    has seen fail is a gate taken on faith.
 *
 * The "main" side is a throwaway copy (script + corpus) so a mutation can never touch this repository's
 * real corpus; the Java side is a throwaway git repository. The tests never use the network.
 *
 * Run: node --test scripts/check-java-vector-sync.test.mjs
 *
 * 回归测试：check-java-vector-sync.mjs（node:test，零依赖）。两类用例：
 *
 *  - ref 选择。共用检出停在别的分支时，旧写法比对 Java 工作树，会遮蔽向量漂移；修复改为读 `main`、
 *    没有则回落 `HEAD`，这些用例把这一选择钉住，防止悄悄回退。
 *  - 反向取证。判据 3（schema 内容）与判据 4（显式 `/4` 断言）各用一个变异证明：改掉一个字段，
 *    闸必须变红并点名改了什么——没见它红过的闸，只能靠相信。
 *
 * 「主仓」侧是一次性副本（脚本 + 语料），变异永远碰不到本仓真实语料；Java 侧是一次性 git 仓。测试不联网。
 *
 * 运行：node --test scripts/check-java-vector-sync.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

const EP_SCHEMA_REL = 'schemas/v6/evidence-package.schema.json';

/** Dirs made by the mutation cases; removed in `after()`. 变异用例创建的目录，`after()` 里统一清理。 */
const scratchDirs = [];

/**
 * A writable "main" side: a copy of the gate script next to a copy of this repository's corpus. The
 * gate derives its main-side path from its own location, so mutating `<root>/Server-NestJS/specs/protocol`
 * is a main-side (TS corpus) change with zero risk to the real checkout.
 * 可写的「主仓」侧：脚本副本 + 本仓语料副本同处一棵临时树。闸按自身位置推导主仓路径，因此改
 * `<root>/Server-NestJS/specs/protocol` 就是一次真实的「主仓侧」变更，却碰不到本仓。
 */
const makeHarness = () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-java-gate-main-'));
  scratchDirs.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'scripts/check-java-vector-sync.mjs'));
  const mainCorpus = join(root, 'Server-NestJS/specs/protocol');
  cpSync(CORPUS, mainCorpus, { recursive: true });
  return { script: join(root, 'scripts/check-java-vector-sync.mjs'), mainCorpus };
};

/** A throwaway Java snapshot repository (`conformance/vectors`), complete and on `main`. 一次性 Java 快照仓。 */
const makeJavaFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-java-gate-snapshot-'));
  scratchDirs.push(dir);
  copyCorpus(dir);
  mustGit(dir, 'init', '-q', '-b', 'main');
  mustGit(dir, 'add', '--', 'conformance');
  mustGit(dir, 'commit', '-q', '-m', 'complete snapshot');
  return dir;
};

const runGate = (script, javaDir) =>
  spawnSync(process.execPath, [script, '--java', javaDir], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

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
  for (const dir of [fixtureDir, noMainDir, ...scratchDirs]) {
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

test('criterion 3: a field removed from a schema on the main side is red and names file+field — 判据 3：主仓删一个 schema 字段 ⇒ 红并点名文件与字段', () => {
  const harness = makeHarness();
  const javaDir = makeJavaFixture();
  const rel = 'schemas/v1/audit-chain-verification.schema.json';
  const mainFile = join(harness.mainCorpus, rel);
  const original = readFileSync(mainFile, 'utf8');

  const clean = runGate(harness.script, javaDir);
  assert.equal(clean.status, 0, `baseline should be green:\n${clean.stdout}\n${clean.stderr}`);

  // The main side loses a field the Java snapshot still declares. Same file set, same everything else,
  // so only the parsed-content comparison can catch it. 主仓删掉 Java 快照仍声明的字段；文件集不变，
  // 只有「解析后内容」比较抓得住。
  const schema = readJson(mainFile);
  delete schema.properties.chain.items.properties.prevHash;
  writeJson(mainFile, schema);

  const red = runGate(harness.script, javaDir);
  assert.equal(red.status, 1, `${red.stdout}\n${red.stderr}`);
  assert.match(red.stdout, /schema 内容漂移/);
  assert.match(red.stdout, /v1\/audit-chain-verification\.schema\.json/);
  assert.match(red.stdout, /prevHash/);
  assert.match(red.stderr, /跨仓漂移未通过/);

  writeFileSync(mainFile, original);
  const restored = runGate(harness.script, javaDir);
  assert.equal(restored.status, 0, `restored should be green:\n${restored.stdout}\n${restored.stderr}`);
});

test('criterion 4: dropping coverage from /4 required on both sides stays red and only criterion 4 catches it — 判据 4：两侧同删 /4 的 coverage 仍红，且只有判据 4 抓得住', () => {
  const harness = makeHarness();
  const javaDir = makeJavaFixture();
  const mainFile = join(harness.mainCorpus, EP_SCHEMA_REL);
  const javaFile = join(javaDir, 'conformance/vectors', EP_SCHEMA_REL);
  const mainOriginal = readFileSync(mainFile, 'utf8');
  const javaOriginal = readFileSync(javaFile, 'utf8');

  const clean = runGate(harness.script, javaDir);
  assert.equal(clean.status, 0, `baseline should be green:\n${clean.stdout}\n${clean.stderr}`);

  // Both copies lose `coverage` from the `/4` branch's `required`. Content stays equal, so criterion 3
  // is blind by construction; only the explicit assertion can say no. Java is read from the git ref,
  // hence the commit. 两侧同时从 `/4` 分支的 required 删掉 coverage：内容仍相等，判据 3 按设计看不出；
  // 只有显式断言能拦住。Java 侧读 git ref，故须提交。
  const dropCoverage = (file) => {
    const schema = readJson(file);
    const branch = schema.oneOf.find(
      (v) => v?.properties?.format?.const === 'keelbase-audit-evidence/4',
    );
    assert.ok(branch, `${file}: fixture corpus lost the /4 branch`);
    branch.required = branch.required.filter((k) => k !== 'coverage');
    writeJson(file, schema);
  };
  dropCoverage(mainFile);
  dropCoverage(javaFile);
  mustGit(javaDir, 'add', '--', `conformance/vectors/${EP_SCHEMA_REL}`);
  mustGit(javaDir, 'commit', '-q', '-m', 'both sides drop coverage from /4');

  const red = runGate(harness.script, javaDir);
  assert.equal(red.status, 1, `${red.stdout}\n${red.stderr}`);
  assert.match(red.stderr, /跨仓漂移未通过/);

  // Exactly the two explicit-assertion lines, one per side — criterion 3 contributed nothing. Both are
  // printed under the "schema 内容漂移" heading, so counting the problem lines is the discriminator.
  // 恰好两条显式断言（两侧各一），判据 3 一条也没加；两种问题共用同一个标题，故按问题行数判别。
  const problemLines = red.stdout.split('\n').filter((line) => /^\s+- /.test(line));
  assert.equal(problemLines.length, 2, red.stdout);
  for (const line of problemLines) {
    assert.match(line, /evidence-package\.schema\.json：\/4 分支的 required 缺 coverage/, line);
  }
  assert.match(red.stdout, /主仓 v6\/evidence-package\.schema\.json/);
  assert.match(red.stdout, /Java 快照 v6\/evidence-package\.schema\.json/);

  writeFileSync(mainFile, mainOriginal);
  writeFileSync(javaFile, javaOriginal);
  mustGit(javaDir, 'add', '--', `conformance/vectors/${EP_SCHEMA_REL}`);
  mustGit(javaDir, 'commit', '-q', '-m', 'restore coverage on both sides');
  const restored = runGate(harness.script, javaDir);
  assert.equal(restored.status, 0, `restored should be green:\n${restored.stdout}\n${restored.stderr}`);
});
