#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * What `npm run check:all` runs, and what it deliberately does not — one source for both the printed
 * "not covered" section and the guard test that keeps the two in step.
 *
 * `check:all` answers one question: "is this tree clean enough to push?" It answers it with the static
 * gates. It does not run the unit suite, the e2e shards, lint, the Postgres migration consistency check,
 * or anything that needs a model key — and a green run used to say nothing about that, so the table read
 * as more coverage than it was (2026-10-31 CTO weekly, §13: "run-adversarial skips without a key and
 * does not fail"). This module carries the missing half in data form:
 *
 *   - `coveredNames` / `EXTRA_STEPS` — the entries the gate does run (also consumed by check-all.mjs);
 *   - `NOT_COVERED` — every other verification entry point, with the command, the reason, and exactly
 *     which package.json scripts it accounts for;
 *   - `coverageFindings` — the comparison between the two. A verification script that is in neither list,
 *     a declaration whose script no longer exists, or a declaration for something the gate actually runs,
 *     each comes back as a finding.
 *
 * `scripts/gate-coverage.test.mjs` asserts the real tree yields no findings and that constructed drift
 * yields them; `npm run cli:test` (and the `cli-test` CI job) run that test.
 *
 * 本门跑什么、**不跑什么** —— 打印的「未覆盖」一节与守卫测试共用这一份数据。
 *
 * `check:all` 只回答一个问题：「这棵树够不够干净、能不能推？」它用静态门禁回答。它**不跑**单元套件、e2e 分片、
 * lint、Postgres 迁移一致性，也不跑任何需要模型 key 的东西 —— 而一次全绿的运行**对此只字不提**，于是那张表
 * 读起来比它实际的覆盖更大（2026-10-31 CTO 周会 §13：`run-adversarial` 无 key 时跳过却不报红）。缺的那一半
 * 以数据形式放在本模块里：
 *
 *   - `coveredNames` / `EXTRA_STEPS` —— 本门**会跑**的条目（check-all.mjs 也从这里取）；
 *   - `NOT_COVERED` —— 其余全部验证入口，带命令、原因，以及它对应哪几个 package.json 脚本；
 *   - `coverageFindings` —— 两者的对照。某个验证脚本两边都没进、某条声明指向的脚本已不存在、或某条声明说的是
 *     本门**其实会跑**的东西 —— 各算一条。
 *
 * `scripts/gate-coverage.test.mjs` 断言真实树无 findings、并断言构造出来的漂移会产生 findings；
 * `npm run cli:test`（与 CI 的 `cli-test` job）会跑那条测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROOT_PKG = '';
export const SERVER_PKG = 'Server-NestJS';

/**
 * Gates that only make sense on a tag push. `check:tag-lineage` is run by
 * `.github/workflows/tag-lineage.yml` on every `v*` push; on an ordinary commit it could only answer
 * "not a tag", and a green line saying so is the one thing a pre-push table must not print. The set is
 * shared with `check-all.mjs` and with the guard below, so "what the gate does not run" has one definition.
 *
 * 只在 tag 推送上有意义、因而本门**有意不跑**的门禁。`check:tag-lineage` 由
 * `.github/workflows/tag-lineage.yml` 在每次 `v*` 推送时跑；在一笔普通提交上它只能回答「不是 tag」，
 * 而把这种回答打印成绿色，正是推送前这张表绝不能做的事。这个集合与 `check-all.mjs`、下面的守卫共用，
 * 于是「本门不跑什么」只有一份定义。
 */
export const RELEASE_ONLY = new Set(['check:tag-lineage']);

/**
 * Verification entry points that are not `check:*` scripts but are cheap, deterministic and need nothing
 * but this checkout — so the gate runs them too. `spec:check` is handled with the `check:*` family because
 * it is a root script; this list is for the ones that live in another package.
 *
 * `conformance` was measured at ~10 s and needs no key, no database and no build: it replays the contract
 * corpus against the implementation. It is the only entry outside the `check:*` family that qualified.
 *
 * 不是 `check:*` 脚本、但便宜、确定、除了本检出什么都不需要 —— 于是本门也跑。`spec:check` 因为是根脚本，
 * 归在 `check:*` 那一族里；这份清单放的是**住在别的包里**的那些。
 *
 * `conformance` 实测约 10 秒，不要 key、不要数据库、不要构建：它拿契约语料回放实现。它是 `check:*` 族之外
 * **唯一**够格的一项。
 */
export const EXTRA_STEPS = [
  { pkg: SERVER_PKG, cwd: SERVER_PKG, npm: 'conformance', label: 'Server-NestJS:conformance' },
];

/**
 * The root-package scripts `check:all` runs: every `check:*` except itself and the `RELEASE_ONLY` gates,
 * plus `spec:check`. `exclude` is injectable so the guard can prove the release-only branch.
 *
 * 根包中 `check:all` 会跑的脚本：除自身与 `RELEASE_ONLY` 里的门禁之外的每个 `check:*`，外加 `spec:check`。
 * `exclude` 可注入，便于守卫测试证明「排除 release-only」这一支。
 */
export function coveredNames(rootPkg, { exclude = RELEASE_ONLY } = {}) {
  return Object.keys(rootPkg.scripts)
    .filter((n) => n.startsWith('check:') && n !== 'check:all' && !exclude.has(n))
    .concat(['spec:check'])
    .sort();
}

/**
 * Everything a green `check:all` does **not** stand for. One entry per reachable verification path; each
 * names the package.json scripts it accounts for (`npmScripts`), so the guard test can tell an accounted-for
 * gap from a silent one. Shell entry points that are not npm scripts carry `shellScripts` instead and are
 * checked for existence.
 *
 * Write a reason for every entry. An entry without one is how the next gap hides.
 *
 * 一次全绿的 `check:all` **不**代表的东西。每条对应一条可达的验证路径，并点名它负责的 package.json 脚本
 * （`npmScripts`）—— 守卫测试据此分辨「已交代的空档」与「没人知道的空档」。不是 npm 脚本的 shell 入口用
 * `shellScripts`，只检查文件是否存在。
 *
 * 每条都要写原因。不写原因的条目，正是下一道空档的藏身之处。
 */
export const NOT_COVERED = [
  {
    commands: ['cd Server-NestJS && npm test'],
    alsoCovers: ['test:wire-schema', 'test:protocol-corpus', 'test:failure-path', 'scenarios:check'],
    npmScripts: [
      { pkg: SERVER_PKG, name: 'test' },
      { pkg: SERVER_PKG, name: 'test:watch' },
      { pkg: SERVER_PKG, name: 'test:wire-schema' },
      { pkg: SERVER_PKG, name: 'test:protocol-corpus' },
      { pkg: SERVER_PKG, name: 'test:failure-path' },
      { pkg: SERVER_PKG, name: 'scenarios:check' },
    ],
    reason: {
      zh: '整棵 jest 套件（含上面四道 jest 子集）。不在此门：跑一遍的耗时比本题全部静态门禁高一个量级；CI 的 `test` job 每次推送都跑它。',
      en: 'The whole jest suite (the four jest selections above are subsets of it). Not here: a run costs an order of magnitude more than every static gate in this table; CI\'s `test` job runs it on every push.',
    },
  },
  {
    commands: ['cd Server-NestJS && npm run test:cov'],
    npmScripts: [{ pkg: SERVER_PKG, name: 'test:cov' }],
    reason: {
      zh: '整棵套件 + 覆盖率门槛（statements/branches/functions/lines 与安全模块分档）。不在此门：跑的时间同上一项，且门槛是 CI 的 `test` job 在守。',
      en: 'The whole suite plus the coverage thresholds (statements/branches/functions/lines and the per-module security tiers). Not here: same cost as the entry above, and CI\'s `test` job enforces the thresholds.',
    },
  },
  {
    commands: ['cd Server-NestJS && npm run test:e2e'],
    alsoCovers: ['test:e2e:cov'],
    npmScripts: [
      { pkg: SERVER_PKG, name: 'test:e2e' },
      { pkg: SERVER_PKG, name: 'test:e2e:cov' },
    ],
    reason: {
      zh: '端到端套件：分四片起真进程与真库（`NODE_ENV=test`），某片崩了还会重试。不在此门：它是本次推送前那道门的**下游**，不是它的补充；CI 的 `test` job 每次推送都跑。',
      en: 'The end-to-end suite: four shards, real processes and a real database (`NODE_ENV=test`), with a retry when a shard dies. Not here: it sits downstream of the pre-push gate rather than extending it; CI\'s `test` job runs it on every push.',
    },
  },
  {
    commands: ['npm run cli:test'],
    npmScripts: [{ pkg: ROOT_PKG, name: 'cli:test' }],
    reason: {
      zh: '`scripts/*.test.mjs` 的 node:test 套件，实测**约 100 秒**（写入本句时 328 例）—— 比本题全部静态门禁的合计还长。不在此门：门禁的价值在于「推之前随手可跑」；CI 的 `cli-test` job 每次推送都跑，本模块的守卫测试也在其中。',
      en: 'The node:test suite for `scripts/*.test.mjs` — measured at **~100 s** (328 cases when this line was written), longer than every static gate here combined. Not here: the point of this gate is that it is cheap enough to run on the way to a push; CI\'s `cli-test` job runs it on every push, and the guard test for this module is one of its cases.',
    },
  },
  {
    commands: ['node scripts/check-tag-lineage.mjs --tag <tag> --main <ref>'],
    npmScripts: [{ pkg: ROOT_PKG, name: 'check:tag-lineage' }],
    reason: {
      zh: '发布 tag 的谱系检查（tag 指向的提交在 main 上、且那条提交的 CI 是绿的）。不在此门：它只在 `v*` tag 推送时有意义 —— 由 `.github/workflows/tag-lineage.yml` 在 tag 推送时跑；在一笔普通提交上它只能回答「不是 tag」，把这种回答打印成绿色正是这张表绝不能做的事。',
      en: 'The release-tag lineage check (the tagged commit is on main and its CI run is green). Not here: it only means anything on a `v*` tag push, where `.github/workflows/tag-lineage.yml` runs it; on an ordinary commit it could only answer "not a tag", and printing that as green is the one thing this table must not do.',
    },
  },
  {
    commands: ['cd Server-NestJS && npm run lint'],
    npmScripts: [{ pkg: SERVER_PKG, name: 'lint' }],
    reason: {
      zh: 'eslint，但本地的 `lint` 脚本带 `--fix` —— 它会**改写**被判的那棵树，回答不了「这棵树干净吗」。不在此门：CI 的 `lint` job 跑的是严格形态（不带 `--fix`），每次推送都跑；类型那一半由 `check:test-types` 与 `npm run build` 在本地守。',
      en: 'eslint — but the local `lint` script passes `--fix`, so it **rewrites** the tree it is judging and cannot answer "is this tree clean". Not here: CI\'s `lint` job runs the strict form (no `--fix`) on every push, and the type half is held locally by `check:test-types` and `npm run build`.',
    },
  },
  {
    commands: ['cd Server-NestJS && npm run migration:consistency:pg'],
    npmScripts: [{ pkg: SERVER_PKG, name: 'migration:consistency:pg' }],
    reason: {
      zh: '需要**活的 PostgreSQL**（Docker 在时起临时容器，实测 31–45 秒）。不在此门：没有 Docker 的机器上它只会永远红，那会把本门的含义耗掉；表那一半由 `check:entity-migrations` 静态守住，pg 那一半在 CI 的 `migration-consistency-postgres` job 里每次推送都跑。要手动跑，前置写在 `docs/manual/delivery-recipe.md` §5。',
      en: 'Needs a **live PostgreSQL** (a throwaway container when Docker is up; measured at 31–45 s). Not here: on a machine without Docker it could only ever fail, which would cost this gate its meaning; the table half is held statically by `check:entity-migrations`, and the Postgres half runs on every push in CI\'s `migration-consistency-postgres` job. To run it by hand, the prerequisite is in `docs/manual/delivery-recipe.md` §5.',
    },
  },
  {
    commands: ['node Server-NestJS/scripts/verify-permission-denied.mjs', 'node Server-NestJS/scripts/verify-trust-proof.mjs'],
    alsoCovers: [
      'verify:evidence',
      'verify:evidence-root',
      'verify:protocol-trust',
      'verify:protocol-trust:crm',
      'verify:full-profile',
      'verify:chain-anchor',
    ],
    npmScripts: [
      { pkg: SERVER_PKG, name: 'verify:evidence' },
      { pkg: SERVER_PKG, name: 'verify:trust-proof' },
      { pkg: SERVER_PKG, name: 'verify:evidence-root' },
      { pkg: SERVER_PKG, name: 'verify:protocol-trust' },
      { pkg: SERVER_PKG, name: 'verify:protocol-trust:crm' },
      { pkg: SERVER_PKG, name: 'verify:full-profile' },
      { pkg: SERVER_PKG, name: 'verify:chain-anchor' },
    ],
    reason: {
      zh: '产品证明类验证（治理闭环、越权 403、信任证明、证据根、多系统）。不在此门：它们要**先起后端**（有的还要模型 key 或 Ollama），属于演示/评审时跑的实证，不是推送前的静态门。命令、前置与报告位置逐条见 `docs/manual/verification-index.md`。',
      en: 'Product-proof verifications (governance loop, unauthorized 403, trust proof, evidence root, multi-system). Not here: they need **a running backend** (some also a model key or Ollama) — they are evidence runs for a demo or a review, not a static pre-push gate. Command, prerequisite and report location for each are in `docs/manual/verification-index.md`.',
    },
  },
  {
    commands: ['./scripts/benchmark/run-adversarial.sh'],
    shellScripts: ['scripts/benchmark/run-adversarial.sh'],
    reason: {
      zh: '对抗实证：真实 LLM 驱动的 Run/Safety/攻击回归。不在此门：要真模型 key，**没有 key 时它会跳过而不报红** —— 这正是 2026-10-31 CTO 周会 §13 记下的那条风险。CI 的 `run-adversarial` job 是 `continue-on-error`（无 key 时同样跳过），故「CI 也没有红」同样**不代表**它跑过。',
      en: 'Adversarial proof: Run/Safety/attack regression driven by a real LLM. Not here: it needs a real model key, and **without one it skips without failing** — the risk recorded in the 2026-10-31 CTO weekly, §13. The CI `run-adversarial` job is `continue-on-error` (and also skips with no key), so "CI was not red either" does **not** mean it ran.',
    },
  },
];

const FAMILY =[/^(test|lint)(:|$)/, /^verify:/];

/**
 * Every npm script that is a verification entry point, qualified as `<pkg>:<name>` (root package uses the
 * empty prefix, so `:cli:test`). Family patterns plus the named one-offs — `check:*` (root) and
 * `spec:check` are here too, so a new `check:*` is picked up without editing this list.
 *
 * 全部「验证入口」npm 脚本，记作 `<包>:<名字>`（根包用空前缀，即 `:cli:test`）。族模式 + 点名的特例 ——
 * 根包的 `check:*` 与 `spec:check` 也在内，于是新增一道 `check:*` 不用改本清单。
 */
export function universe(rootPkg, serverPkg) {
  const found = new Set();
  for (const name of Object.keys(rootPkg.scripts)) {
    if (
      (name.startsWith('check:') && name !== 'check:all') ||
      name === 'spec:check' ||
      name === 'cli:test' ||
      FAMILY.some((r) => r.test(name))
    ) {
      found.add(`${ROOT_PKG}:${name}`);
    }
  }
  for (const name of Object.keys(serverPkg.scripts)) {
    if (FAMILY.some((r) => r.test(name)) || name === 'conformance' || name === 'scenarios:check' || name.startsWith('migration:consistency:')) {
      found.add(`${SERVER_PKG}:${name}`);
    }
  }
  return found;
}

const split = (key) => {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
};

/**
 * Compare the declaration against the two package.json files. Returns a list of human-readable findings;
 * empty means the declaration and the scripts agree. `fileExists` is injectable so the test can prove the
 * missing-shell-script branch without touching the disk.
 *
 * 拿声明与两份 package.json 对照。返回一串可读的 findings；空 = 声明与脚本一致。`fileExists` 可注入，
 * 便于测试在不碰磁盘的情况下证明「声明的 shell 脚本不存在」那一条。
 */
export function coverageFindings({
  rootPkg,
  serverPkg,
  declarations = NOT_COVERED,
  fileExists = (rel) => fs.existsSync(path.join(ROOT, rel)),
}) {
  const findings = [];
  const packages = { [ROOT_PKG]: rootPkg, [SERVER_PKG]: serverPkg };
  const name = (key) => (key.startsWith(':') ? key.slice(1) : key);

  const covered = new Set(coveredNames(rootPkg).map((n) => `${ROOT_PKG}:${n}`));
  for (const step of EXTRA_STEPS) covered.add(`${step.pkg}:${step.npm}`);

  const declared = new Map();
  for (const entry of declarations) {
    const keys = (entry.npmScripts ?? []).map((s) => `${s.pkg}:${s.name}`);
    for (const f of entry.shellScripts ?? []) {
      if (!fileExists(f)) findings.push(`声明了但脚本不存在 / declared but missing: ${f}`);
    }
    if (keys.length === 0 && (entry.shellScripts ?? []).length === 0) {
      findings.push(`空声明 / empty declaration: ${entry.commands[0] ?? '(no command)'}`);
    }
    for (const key of keys) {
      if (declared.has(key)) findings.push(`重复声明 / declared twice: ${name(key)}`);
      declared.set(key, entry);
      if (covered.has(key)) {
        findings.push(
          `声明为「不覆盖」，但 check:all 实际会跑它 / declared not-covered, but check:all runs it: ${name(key)}`,
        );
      }
    }
  }

  for (const key of declared.keys()) {
    const [pkg, script] = split(key);
    const manifest = packages[pkg];
    if (!manifest) {
      findings.push(`声明指向未知包 / declaration names an unknown package: ${key}`);
      continue;
    }
    if (!(script in manifest.scripts)) {
      findings.push(`声明了但脚本已不存在 / declared but the script is gone: ${name(key)}`);
    }
  }

  for (const key of universe(rootPkg, serverPkg)) {
    if (!covered.has(key) && !declared.has(key)) {
      findings.push(
        `未覆盖也未声明 / neither run by check:all nor declared not-covered: ${name(key)} — 加进 check:all，或写进 scripts/gate-coverage.mjs 的 NOT_COVERED`,
      );
    }
  }

  return findings;
}
