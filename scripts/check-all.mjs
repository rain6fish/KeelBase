#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Run every repository check in one go and print one summary.
 *
 * The checks are each a CI job of their own — which is right for CI, where you want to see exactly which
 * one broke, and wrong for the moment before a push, where you want "is this tree clean". This is that
 * second thing: it runs each `check:*` script (plus `spec:check`) in sequence and reports a table, so a
 * change that trips one of them is visible locally instead of in CI.
 *
 * A few checks need something this machine may not have (a sibling Java checkout for the vector sync, a
 * headless browser for the mobile preview). Those show as failures too — the summary names the script,
 * so a failure here means "run it yourself and read why", not necessarily "the tree is broken".
 *
 * One gate is deliberately not collected, and it is worth writing down why so the next audit does not
 * re-open it: the Postgres migration consistency check (`migration-consistency-postgres` in CI,
 * `npm run migration:consistency:pg` locally). It needs a live PostgreSQL — a throwaway container when
 * Docker is up, 31-45s measured, i.e. roughly this whole suite's runtime again. Local development is
 * sqlite-first, so on a machine without Docker it could only ever fail, which costs this instrument its
 * meaning; and skipping it here would be worse than omitting it, because this table prints one line per
 * gate and discards each gate's output on success — a skip would read exactly like a pass. The failure
 * class it would catch locally (an entity changed with no migration) is the one that left main red for
 * about ten hours; `check:entity-migrations` covers its table half statically and without a database,
 * and CI runs the Postgres half on every push. The place to run it by hand is
 * `docs/manual/delivery-recipe.md` §5, which names the prerequisite.
 *
 * 一条命令跑完全部仓内门禁、打印一张汇总表。
 *
 * 这些检查在 CI 里各是一个 job —— 对 CI 是对的（要看是哪一个红的），而**推送之前**你想要的其实是
 * 「这棵树干不干净」。本脚本就是后一件事：顺序跑每个 `check:*`（外加 `spec:check`）并汇总成表，于是
 * 触到某个门禁的改动在**本地**就看得见，而不是等到 CI。
 *
 * 有几项需要本机未必有的东西（向量同步要同级 Java 检出、移动预览要无头浏览器）——它们同样会显示为失败；
 * 汇总里带着脚本名，所以这里的红意思是「你自己跑一下看原因」，**不必然**是「树坏了」。
 *
 * 有一道门禁是**有意不收**的，理由写在这里，免得下一轮体检重新吵一遍：postgres 迁移一致性
 * （CI 的 `migration-consistency-postgres`，本地 `npm run migration:consistency:pg`）。它要一个**活的
 * PostgreSQL** —— Docker 在时起临时容器，实测 31-45s，差不多等于本套件目前的全部耗时。本地开发以 sqlite
 * 为主，于是没有 Docker 的机器上它只会**永远红**，那会把这个仪器的含义耗掉；而在这里**静默跳过**比不收更糟：
 * 这张表一道闸只打一行，且成功时**丢弃**该闸的输出 —— 跳过读起来与通过一模一样。它在本机能抓到的那个
 * 失败类（实体改了却没迁移）正是让 main 红了约十小时的那一类：其中「表」那一半已由 `check:entity-migrations`
 * **静态、无需数据库**地守住，postgres 那一半在每次推送时由 CI 跑。要手动跑它，位置写在
 * `docs/manual/delivery-recipe.md` §5，前置条件在那里点明了。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const names = Object.keys(pkg.scripts)
  .filter((n) => n.startsWith('check:') && n !== 'check:all')
  .concat(['spec:check'])
  .sort();

const width = Math.max(...names.map((n) => n.length));
const failures = [];
const started = Date.now();

for (const name of names) {
  process.stdout.write(`▶ ${name.padEnd(width)} `);
  const t0 = Date.now();
  try {
    execFileSync('npm', ['run', '--silent', name], { cwd: ROOT, stdio: 'pipe', shell: true });
    console.log(`✓  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n    ');
    console.log(`✗  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`    ${out}`);
    failures.push(name);
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(`\n[check-all] ${names.length - failures.length}/${names.length} 通过，${failures.length} 未过（${secs}s）：`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n逐条单跑看原因：npm run <名字>。\nRun one on its own for the detail: npm run <name>.\n`);
  process.exit(1);
}
console.log(`\n[check-all] ${names.length}/${names.length} 全过（${secs}s）`);
