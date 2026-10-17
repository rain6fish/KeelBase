#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Every `check:*` gate must actually be run by something — CI or a runner script.
 *
 * A gate nobody runs is worse than no gate: it reads as coverage and gives none. On 2026-10-11 one was
 * found in exactly that state — `check:java-vectors` exists, is wired to `npm run`, and is invoked by
 * neither the workflow nor the release gate. It had also drifted red in the meantime (the sibling Java
 * checkout's vendored vectors are behind this repository's corpus), which is precisely the drift it was
 * written to catch, sitting invisible. That one is wired now — the `java-vector-drift` job in
 * `.github/workflows/ci.yml` fetches the sibling checkout onto the runner, which is what the
 * exemption said CI could not do (2026-10-15, P1-13).
 *
 * 它后来接上了 —— `.github/workflows/ci.yml` 的 `java-vector-drift` job 把同级检出取到 runner 上，
 * 而那条豁免说的正是「CI 做不到这件事」（2026-10-15，`P1-13`）。
 *
 * The rule: the script a `check:*` entry points at must appear in `.github/workflows/*.yml`, in
 * `scripts/release-gate.sh`, or in `package.json` (for the entries the workflow calls by name). Anything
 * else needs an entry in EXEMPT below **with a reason** — an unexplained exemption is how the next one
 * hides.
 *
 * 每道 `check:*` 门禁都必须真的被某样东西跑起来 —— CI 或某个 runner 脚本。
 *
 * **没人跑的门禁比没有门禁更糟**：它读起来像覆盖、实际一点也没有。2026-10-11 就逮到一道正在这个状态里 ——
 * `check:java-vectors` 存在、挂在 `npm run` 下，却既不在工作流里、也不在 release gate 里；而它**同时已
 * 经漂成了红的**（同级 Java 检出的词向量落后本仓语料）—— 那**正是它被写出来要抓的那个漂移**，一直没人看见。
 *
 * 规则：`check:*` 指向的脚本必须出现在 `.github/workflows/*.yml`、`scripts/release-gate.sh` 或
 * `package.json`（工作流按名字调的那些）里。其余都要在下面的 EXEMPT 里**写明理由** —— 无理由的豁免，
 * 正是下一道藏身之处。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Deliberately not run by CI. Each entry says why — no entry, no exemption.
// 有意不在 CI 里跑的。每条写明**为什么** —— 不写理由就不豁免。
// Empty since 2026-10-15, and deliberately so: `check:java-vectors` was the only entry, and the
// `java-vector-drift` job in `.github/workflows/ci.yml` now checks KeelBase4J out onto the runner and
// runs it. The exemption said CI could not have the sibling checkout; giving the job that checkout is
// the answer to that, not a permanent exception. The next entry written here still needs a reason.
// 自 2026-10-15 起为空，这是有意的：原先只有 `check:java-vectors` 一条，而 `.github/workflows/ci.yml`
// 的 `java-vector-drift` job 现在会把 KeelBase4J 检出到 runner 上跑它。那条豁免说「CI 拿不到同级检出」
// —— 给这个 job 那个检出，才是对它的回答，而不是一条永久例外。下一条写进来的仍要**写理由**。
const EXEMPT = new Map([]);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// The runners only — NOT package.json, which declares every gate and would therefore make this vacuous.
// 只算 runner —— **不含 package.json**：它声明了每一道闸，放进来就等于空闸。
const runners = [
  ...fs.readdirSync(path.join(ROOT, '.github/workflows')).map((f) => `.github/workflows/${f}`),
  'scripts/release-gate.sh',
]
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  // Comments are not wiring: release-gate.sh already names a gate script in its header comment, and a
  // commented-out `run:` line is not a call. Without this, a gate nobody runs can still report as wired.
  // 注释不算接线：release-gate.sh 的头注释里就出现过一道闸的脚本路径，而被注释掉的 `run:` 也不是调用。
  // 不过滤的话，一道没人跑的闸仍会报「已接线」。
  .join('\n')
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const failures = [];
const gates = Object.keys(pkg.scripts).filter((n) => n.startsWith('check:') && n !== 'check:all');

for (const name of gates) {
  if (EXEMPT.has(name)) continue;
  const file = (pkg.scripts[name].match(/scripts\/[\w.-]+/g) ?? []).pop();
  if (!file) {
    failures.push(`${name} — 解析不出它指向的脚本文件`);
    continue;
  }
  // Called either by path, or by its npm script name.
  // 要么按路径调，要么按它的 npm 脚本名调。
  if (!runners.includes(file) && !new RegExp(`\\b(run|--silent)\\s+${name}\\b`).test(runners)) {
    failures.push(`${name}（${file}）—— 不在任何 workflow / release-gate 的调用里`);
  }
}

if (failures.length > 0) {
  console.error(`\n[gates-wired] ${failures.length} 道门禁没人跑：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n把它接进 CI（一个 job）或 release-gate.sh；确实不该跑的，在 ${'scripts/check-gates-wired.mjs'} 的 EXEMPT 里写明理由。\n` +
      `Wire it into the workflow or the release gate — or exempt it in EXEMPT with a reason.\n`,
  );
  process.exit(1);
}
console.log(`[gates-wired] ${gates.length} 道 check:* 门禁都有东西在跑（另有 ${EXEMPT.size} 道按理由豁免）✓`);
