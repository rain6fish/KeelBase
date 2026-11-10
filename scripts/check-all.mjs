#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Run every repository check in one go and print one summary.
 *
 * The checks are each a CI job of their own — which is right for CI, where you want to see exactly which
 * one broke, and wrong for the moment before a push, where you want "is this tree clean". This is that
 * second thing: it runs each `check:*` script (plus `spec:check` and `conformance`) in sequence and reports
 * a table, so a change that trips one of them is visible locally instead of in CI.
 *
 * A few checks need something this machine may not have (a sibling Java checkout for the vector sync, a
 * headless browser for the mobile preview). Those show as failures too — the summary names the script,
 * so a failure here means "run it yourself and read why", not necessarily "the tree is broken".
 *
 * **What a green run does not mean.** This table is the static half of the verification story: the unit
 * suite, e2e, lint, the Postgres migration consistency check and the adversarial run are not in it, and a
 * green line says nothing about them. Every run ends with a "not covered by this gate" section listing
 * each of those entries with its command and why; the data behind it lives in `scripts/gate-coverage.mjs`,
 * and `scripts/gate-coverage.test.mjs` turns red when a verification script appears without the
 * declaration keeping up (2026-10-31 CTO weekly §13).
 *
 * 一条命令跑完全部仓内门禁、打印一张汇总表。
 *
 * 这些检查在 CI 里各是一个 job —— 对 CI 是对的（要看是哪一个红的），而**推送之前**你想要的其实是
 * 「这棵树干不干净」。本脚本就是后一件事：顺序跑每个 `check:*`（外加 `spec:check` 与 `conformance`）并
 * 汇总成表，于是触到某个门禁的改动在**本地**就看得见，而不是等到 CI。
 *
 * 有几项需要本机未必有的东西（向量同步要同级 Java 检出、移动预览要无头浏览器）——它们同样会显示为失败；
 * 汇总里带着脚本名，所以这里的红意思是「你自己跑一下看原因」，**不必然**是「树坏了」。
 *
 * **全绿不代表什么。** 这张表只是验证故事的**静态那一半**：单元套件、e2e、lint、Postgres 迁移一致性、
 * 对抗实证都不在里面，一行绿对它们**什么也没说**。每次运行都以「本门未覆盖」一节收尾，逐条给出命令与
 * 原因；数据在 `scripts/gate-coverage.mjs`，而 `scripts/gate-coverage.test.mjs` 会在「冒出一个验证脚本、
 * 声明却没跟上」时判红（2026-10-31 CTO 周会 §13）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coveredNames, EXTRA_STEPS, NOT_COVERED, RELEASE_ONLY } from './gate-coverage.mjs';
import { contractSubmoduleProblem, SUBMODULE_FIX } from './require-contract-submodule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Gates that need a tag and a CI run that only exist on a tag push. `check:tag-lineage` is run by
// `.github/workflows/tag-lineage.yml` on every `v*` push; in this table, on an ordinary commit, it could
// only answer "not a tag", and printing that as green is the one thing this instrument must not do.
// 需要 tag 与只存在于 tag 推送上的 CI 运行的门禁。`check:tag-lineage` 由
// `.github/workflows/tag-lineage.yml` 在每次 `v*` 推送时跑；在一笔普通提交上把它放进本表，它只能回答
// 「不是 tag」，而把这种回答打印成绿色，正是本仪器绝不能做的事。
//
// The set is exported by `gate-coverage.mjs` so the filter, the printed "not covered" section and the
// guard test all use one definition.
// 这个集合由 `gate-coverage.mjs` 导出，于是本过滤、「未覆盖」打印与守卫测试用的是同一份定义。
const releaseContext = RELEASE_ONLY;

const names = coveredNames(pkg, { exclude: releaseContext });
const steps = names.concat(EXTRA_STEPS.map((s) => s.label));

const width = Math.max(...steps.map((n) => n.length));
const failures = [];
const started = Date.now();

// The scope is stated on every run: this instrument answers "is the tree clean before a push", not
// "do the tests pass".
// 射程必须每次都说：这台仪器回答的是「推送前这棵树干不干净」，不是「测试过不过」。
console.log(
  '── This runs the static gates only — it excludes unit tests, e2e tests and the Java test suites, ' +
    'which run in their own CI jobs ──\n' +
    '   本命令只跑仓内静态门禁：不含单元测试 / e2e / Java 测试 —— 那些在各自的 CI job 里跑。\n',
);

/**
 * Prerequisites are reported before the table, once, with the command that fixes each. Four gates below go
 * red when these are missing, and each of them can only describe its own symptom — the contract submodule's
 * absence reads as `ERR_MODULE_NOT_FOUND`, a missing schema directory, or (worst) a bogus README/contract
 * mismatch. Saying it once, at the top, turns four puzzles into one command.
 *
 * This does not stop the run: the gates that do not depend on these prerequisites are still worth reading.
 *
 * 先决条件在表格之前报一次，每条都带上能修好它的命令。缺这些时下面有**四道**门禁会红，而每道只能说出
 * 自己的症状 —— 契约 submodule 缺失会读成 `ERR_MODULE_NOT_FOUND`、schema 目录不存在，甚至（最糟）
 * 一个并不存在的 README/契约不符。在顶部说一次，就把四道谜题变成一条命令。
 *
 * 它不中断运行：不依赖这些前提的门禁仍然值得读。
 */
const prerequisites = [];
{
  const problem = contractSubmoduleProblem(ROOT);
  if (problem) prerequisites.push({ zh: problem.zh, en: problem.en, fix: SUBMODULE_FIX });
}
const serverNodeModules = path.join(ROOT, 'Server-NestJS', 'node_modules');
if (!fs.existsSync(serverNodeModules)) {
  prerequisites.push({
    zh: 'Server-NestJS/node_modules 缺失（check:app-wiring 会因此报「找不到 jest」）',
    en: 'Server-NestJS/node_modules is missing (check:app-wiring will report "cannot find jest")',
    fix: 'cd Server-NestJS && npm install',
  });
}
if (prerequisites.length > 0) {
  console.log('── 先决条件 / prerequisites ──');
  for (const p of prerequisites) {
    console.log(`  ✗ ${p.zh}`);
    console.log(`    ✗ ${p.en}`);
    console.log(`    → ${p.fix}`);
  }
  console.log(
    '\n  先跑上面每条命令，再复跑 npm run check:all —— 下面传不过的门禁多半就是它们造成的。\n' +
      '  Run the commands above, then re-run npm run check:all — the gates that fail below usually come from these.\n',
  );
}

function runStep(label, cwd, script) {
  process.stdout.write(`▶ ${label.padEnd(width)} `);
  const t0 = Date.now();
  try {
    execFileSync('npm', ['run', '--silent', script], { cwd, stdio: 'pipe', shell: true });
    console.log(`✓  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n    ');
    console.log(`✗  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`    ${out}`);
    failures.push(label);
  }
}

for (const name of names) runStep(name, ROOT, name);
for (const step of EXTRA_STEPS) runStep(step.label, path.join(ROOT, step.cwd), step.npm);

/**
 * The half this table cannot show. Printed on every run — pass or fail — because the reader who sees a
 * green table is exactly the one about to assume it covered more than it did. Reasons are not restated
 * here: they live next to the data in `scripts/gate-coverage.mjs`, where the guard test can check whether
 * they are still true.
 *
 * 这张表**显示不了**的那一半。每次运行都打印 —— 通过与否都一样 —— 因为看见一张绿表的读者，正是最容易以为
 * 它覆盖得更多的人。原因不在这里复述：它们在 `scripts/gate-coverage.mjs` 里、紧挨着数据，守卫测试才检查得了
 * 它们是否仍然成立。
 */
function printNotCovered() {
  console.log('\n── 本门未覆盖 / not covered by this gate ──');
  console.log('  上面那张表**不跑**下面这些 —— 它全绿，不代表这些也过了。');
  console.log('  The table above does **not** run these — a green table is not a pass for any of them.');
  for (const e of NOT_COVERED) {
    console.log(`\n  ✗ ${e.commands.join('  ·  ')}`);
    if (e.alsoCovers?.length) console.log(`      也含 / also covers: ${e.alsoCovers.join(' · ')}`);
    console.log(`      ${e.reason.zh}`);
    console.log(`      ${e.reason.en}`);
  }
  console.log('\n  清单与原因的单源：scripts/gate-coverage.mjs（守卫测试 node --test scripts/gate-coverage.test.mjs）。');
  console.log('  Single source for this list and its reasons: scripts/gate-coverage.mjs (guard test as above).');
}

printNotCovered();

const total = steps.length;
const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(`\n[check-all] ${total - failures.length}/${total} 通过，${failures.length} 未过（${secs}s）：`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n逐条单跑看原因：npm run <名字>。\nRun one on its own for the detail: npm run <name>.\n`);
  process.exit(1);
}
console.log(`\n[check-all] ${total}/${total} 全过（${secs}s）`);
