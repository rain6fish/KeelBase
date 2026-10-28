#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * P0-19 ② readings — one command, and a reading that falls is a non-zero exit.
 *
 * `test/p019-readings.measure.ts` already answers the two questions (Action Recoverability and
 * Lifecycle Coverage, per event class per door) and prints the answer. What it cannot do on its own
 * is *fail* when the answer changes: its exit code says "the instrument ran", not "the numbers are
 * the ones we know". That is the gap this script closes. It runs the instrument, reads the machine
 * line it prints, and compares it against `test/p019-readings.baseline.json` — a file that lives in
 * the repository, so the numbers are pinned by something a reviewer can see the diff of, not by a
 * paragraph in a report.
 *
 *     npm run measure:p019              # compare; exit 1 and name the class and the dimension on a miss
 *     npm run measure:p019 -- --update  # re-pin the baseline (the diff is the review)
 *
 * Why this matters here, concretely: on 2026-10-15 a reading was taken and the audit row's entity
 * literal turned out to be missing `outcome` and `tool` — 30 audit rows, none of them carrying
 * either column. The reading is what made that visible. A one-off reading finds that once; a baseline
 * finds the *next* one. The reverse proof is written up in `handoff/readings-instrument-20261028.md`.
 *
 * Exit codes — three states, because "the numbers moved" and "the instrument never ran" are
 * different problems and the second must not be read as the first:
 *
 *   0  every class on every dimension matches the baseline
 *   1  at least one reading moved away from the baseline (the interesting failure)
 *   2  the instrument did not report a reading at all — no `MACHINE` line, or readings that cannot
 *      be compared (missing/corrupt baseline)
 *
 * The instrument's own self-check (`⑨ 反向可证`, which mutates in-memory copies) is expected to go
 * red alongside a real regression, because it hard-codes numbers measured on the healthy product.
 * So a failing jest run is *not* treated as "no reading": the machine line is printed before that
 * step, and the readings are compared and reported first. The self-check failure is added below
 * them as a second line of evidence rather than replacing the real one.
 *
 * P0-19 ② 读数 —— 一条命令，掉下来就是非零退出。
 *
 * `test/p019-readings.measure.ts` 已经会回答那两个问题（Action Recoverability 与 Lifecycle
 * Coverage，按门、按事件类），并把答案打出来。它自己做不到的是**答案变了就失败**：它的退出码说的是
 * 「仪器跑完了」，不是「数还是我们认识的那几个」。本脚本补的就是这个缺口 —— 跑仪器、读它打出的机读行、
 * 与 `test/p019-readings.baseline.json` 比对。基线**在仓里**，于是钉住这些数的是一个评审能看见 diff 的文件，
 * 不是某份报告里的一段话。
 *
 *     npm run measure:p019              # 比对；不一致则 exit 1，并点名是哪一类、哪一维
 *     npm run measure:p019 -- --update  # 重新钉基线（那份 diff 就是评审要看的）
 *
 * 为什么这件事在这里尤其要紧：2026-10-15 有一次取数，发现审计行的 entity 字面量漏了 `outcome` 与
 * `tool` —— 30 行审计，两列一个都没有。把这件事照出来的是**取数**。一次性的取数只照出一次；
 * 基线才照得出**下一次**。反向证明见 `handoff/readings-instrument-20261028.md`。
 *
 * 退出码三个状态 ——「数动了」与「仪器根本没跑」是两个问题，后者不能被读成前者：
 *
 *   0  每一类、每一维都与基线一致
 *   1  至少一个读数离开了基线（真正要看的那个失败）
 *   2  仪器根本没报出读数 —— 没有 `MACHINE` 行，或读数无法比对（基线缺失/损坏）
 *
 * 仪器自带的自检（`⑨ 反向可证`，在内存副本上抹列）在真回归时**本来就会跟着红** —— 它把健康产品上
 * 量出来的数字写死了。所以 jest 失败**不等于**「没有读数」：机读行比那一步更早打印，读数照样先比对、
 * 先报告；自检的失败放在它**后面**作为第二重证据，而不是替换掉真正的那一条。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'test', 'p019-readings.baseline.json');
const JEST = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
const TEST_REGEX = 'p019-readings\\.measure\\.ts$';

const update = process.argv.includes('--update');

/** jest's console output is not parsed for anything but this one line. */
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function machineReadings(output) {
  for (const line of stripAnsi(output).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('MACHINE {')) continue;
    try {
      return JSON.parse(trimmed.slice('MACHINE '.length));
    } catch (err) {
      return { __parseError: String(err) };
    }
  }
  return null;
}

/**
 * What a reading *is*, for the purpose of pinning: the two counts, and the per-item answers they were
 * counted from. Both the booleans and the `from` column each answer came out of are kept — a predicate
 * that starts reading a weaker column while the count happens to stay the same is a change in what is
 * being measured, and it belongs in the baseline diff rather than passing silently.
 *
 * 钉下来的「读数」是什么：两个计数，以及数出它们的逐项答案。布尔值与每问的取数列都留着 —— 谓词改成
 * 去读一个更弱的列、而计数恰好没变，那是**测量对象**变了，应当出现在基线 diff 里，而不是静默通过。
 */
function comparable(reading) {
  return {
    door: reading.door ?? null,
    klass: reading.klass,
    ar: {
      numerator: reading.ar.numerator,
      denominator: reading.ar.denominator,
      detail: reading.ar.detail,
      evidence: reading.ar.evidence,
    },
    lc: {
      present: reading.lc.present,
      required: reading.lc.required,
      detail: reading.lc.detail,
    },
  };
}

function comparableList(readings) {
  return readings.map(comparable).sort((a, b) => a.klass.localeCompare(b.klass));
}

function fmt(v) {
  if (v === null) return 'n/a';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

/** Every way `cur` disagrees with `base`, each one carrying the scopes that name it. */
function diffEntry(base, cur) {
  const out = [];
  if (base.door !== cur.door) {
    out.push({ scope: 'door', label: 'door', from: fmt(base.door), to: fmt(cur.door) });
  }
  for (const dim of ['ar', 'lc']) {
    const b = base[dim];
    const c = cur[dim];
    const bCounts = dim === 'ar' ? `${b.numerator}/${b.denominator}` : `${b.present}/${b.required}`;
    const cCounts = dim === 'ar' ? `${c.numerator}/${c.denominator}` : `${c.present}/${c.required}`;
    const label = dim === 'ar' ? 'AR' : 'LC';
    if (bCounts !== cCounts) out.push({ scope: label, label: 'count', from: bCounts, to: cCounts });

    for (const item of Object.keys(b.detail)) {
      if (!(item in c.detail)) {
        out.push({ scope: label, label: `${item} (dropped)`, from: fmt(b.detail[item]), to: '—' });
      } else if (b.detail[item] !== c.detail[item]) {
        out.push({ scope: label, label: item, from: fmt(b.detail[item]), to: fmt(c.detail[item]) });
      }
    }
    for (const item of Object.keys(c.detail)) {
      if (!(item in b.detail)) {
        out.push({ scope: label, label: `${item} (new)`, from: '—', to: fmt(c.detail[item]) });
      }
    }

    if (dim === 'ar') {
      for (const q of Object.keys(b.evidence)) {
        if (!(q in c.evidence)) {
          out.push({ scope: 'AR', label: `${q} · read from (dropped)`, from: fmt(b.evidence[q]), to: '—' });
        } else if (b.evidence[q] !== c.evidence[q]) {
          out.push({ scope: 'AR', label: `${q} · read from`, from: fmt(b.evidence[q]), to: fmt(c.evidence[q]) });
        }
      }
    }
  }
  return out;
}

function pad(s, n) {
  s = String(s);
  // The two CJK-ish columns are ASCII here, but the table also prints `uncovered` lists.
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printTable(readings) {
  const rows = readings.map((r) => ({
    door: r.door ?? '?',
    klass: r.klass,
    ar: `${r.ar.numerator}/${r.ar.denominator}`,
    lc: `${r.lc.present}/${r.lc.required}`,
    uncovered: (r.lc.missing ?? []).join(',') || '-',
  }));
  console.log(
    `${pad('door', 6)} ${pad('class', 14)} ${pad('AR (structured-only)', 22)} ${pad('LC (present/required)', 22)} uncovered`,
  );
  console.log('-'.repeat(96));
  for (const r of rows) {
    console.log(`${pad(r.door, 6)} ${pad(r.klass, 14)} ${pad(r.ar, 22)} ${pad(r.lc, 22)} ${r.uncovered}`);
  }
}

function fail2(message) {
  console.error(`\n[measure:p019] ${message}`);
  process.exit(2);
}

// ── run the instrument ────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(JEST)) {
  fail2(
    `jest is not installed at ${path.relative(ROOT, JEST)} — run \`cd Server-NestJS && npm install\` first.\n` +
      `         jest 未安装（${path.relative(ROOT, JEST)}）—— 先跑 \`cd Server-NestJS && npm install\`。`,
  );
}

// The instrument builds its sqlite under `os.tmpdir()`. Pointing TMP* at a scratch directory we
// created steers those files into it, so the whole thing is deleted afterwards and nothing shared
// (`data/front.sqlite`, or another session's simultaneous run) can be touched.
//
// 仪器的 sqlite 建在 `os.tmpdir()` 下。把 TMP* 指向一个自建的临时目录，那些文件就都落进去，
// 跑完整体删掉 —— 于是既碰不到共享的 `data/front.sqlite`，也碰不到另一会话同时跑的读数。
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'p019-measure-'));
const started = Date.now();
let run;
try {
  run = spawnSync(process.execPath, [JEST, '--config', 'test/jest-e2e.json', '--testRegex', TEST_REGEX], {
    cwd: ROOT,
    env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} finally {
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (err) {
    console.error(`[measure:p019] could not remove the scratch directory ${scratch}: ${err.message}`);
  }
}
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const jestOk = run.status === 0;

// ── read the machine line ─────────────────────────────────────────────────────────────────────────
const machine = machineReadings(output);
if (!machine) {
  console.error(output.split(/\r?\n/).slice(-40).join('\n'));
  fail2(
    'the instrument printed no MACHINE line, so there is nothing to compare (exit 2, not 1).\n' +
      '         The readings above could not be read at all — this is a broken instrument, not a moved reading.\n' +
      '         仪器没有打出 MACHINE 行，没有可比对的东西（这是 exit 2，不是 1）。\n' +
      '         上面那些读数一条都没读出来 —— 这是仪器坏了，不是读数动了。',
  );
}
if (machine.__parseError) {
  fail2(`the MACHINE line could not be parsed: ${machine.__parseError}`);
}
if (!Array.isArray(machine.readings) || machine.readings.length === 0) {
  fail2('the MACHINE line carries no readings.');
}

const current = comparableList(machine.readings);

// ── update mode ───────────────────────────────────────────────────────────────────────────────────
if (update) {
  const doc = {
    $comment:
      'Pinned readings for `npm run measure:p019` (P0-19 ②). Written by that script with --update; ' +
      'do not hand-edit. A diff here is the claim that a reading moved on purpose — say why in the ' +
      'commit message. Values come from Server-NestJS/test/p019-readings.measure.ts.',
    $pinnedAt: new Date().toISOString().slice(0, 10),
    readings: current,
  };
  fs.writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`[measure:p019] baseline re-pinned: ${path.relative(process.cwd(), BASELINE)} (${current.length} classes, ${elapsed}s)`);
  process.exit(0);
}

// ── compare ──────────────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(BASELINE)) {
  fail2(
    `no baseline at ${path.relative(ROOT, BASELINE)} — pin one with \`npm run measure:p019 -- --update\`.\n` +
      `         没有基线（${path.relative(ROOT, BASELINE)}）—— 用 \`npm run measure:p019 -- --update\` 钉一份。`,
  );
}
let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
} catch (err) {
  fail2(`the baseline could not be read as JSON: ${err.message}`);
}
if (!Array.isArray(baseline.readings)) fail2('the baseline has no `readings` array.');

const baseByClass = new Map(baseline.readings.map((r) => [r.klass, r]));
const curByClass = new Map(current.map((r) => [r.klass, r]));

const order = [...baseline.readings.map((r) => r.klass)];
for (const r of current) if (!baseByClass.has(r.klass)) order.push(r.klass);

const moved = [];
for (const klass of order) {
  const b = baseByClass.get(klass);
  const c = curByClass.get(klass);
  if (b && c) {
    const d = diffEntry(b, c);
    if (d.length > 0) moved.push({ klass, door: c.door, changes: d });
  } else if (b && !c) {
    moved.push({
      klass,
      door: b.door,
      changes: [{ scope: 'class', label: 'measured', from: 'yes', to: 'no — the class no longer produced a reading' }],
    });
  } else {
    moved.push({
      klass,
      door: c.door,
      changes: [{ scope: 'class', label: 'measured', from: 'no', to: 'yes — a class the baseline never had' }],
    });
  }
}

console.log(`\n=== P0-19 ② readings — ${current.length} classes ===\n`);
// The table is printed from the instrument's own `readings` (which still carry `missing`), in the
// order the instrument measured them; `current` above is the sorted projection used for comparing.
//
// 表格按仪器自己的 `readings`（还带着 `missing`）、按它测量的顺序打印；上面用于比对的 `current` 是排序后的投影。
printTable(machine.readings);

if (moved.length === 0 && jestOk) {
  console.log(
    `\n[measure:p019] ✓ ${current.length}/${current.length} classes match ` +
      `${path.relative(process.cwd(), BASELINE)} (${elapsed}s)`,
  );
  process.exit(0);
}

if (moved.length > 0) {
  console.error(`\n[measure:p019] ✗ readings moved away from ${path.relative(process.cwd(), BASELINE)}\n`);
  for (const m of moved) {
    console.error(`  ${m.door ?? '?'} / ${m.klass}`);
    for (const ch of m.changes) {
      console.error(`    ${pad(ch.scope, 6)} ${pad(ch.label, 34)} ${ch.from} → ${ch.to}`);
    }
    console.error('');
  }
  console.error(
    `${moved.length} of ${order.length} classes disagree with the baseline.\n` +
      `  If the move is the one you meant to make, re-pin it and let the diff say so:\n` +
      `    npm run measure:p019 -- --update\n` +
      `  If it is not, a column the reading depends on stopped being written — that is the failure\n` +
      `  this instrument exists for. The 2026-10-15 precedent is in scripts/measure-p019-readings.mjs.\n\n` +
      `${moved.length} / ${order.length} 类与基线不一致。\n` +
      `  若这次移动正是你要做的改动，就重新钉基线、让那份 diff 自己说：\n` +
      `    npm run measure:p019 -- --update\n` +
      `  若不是，说明读数依赖的某一列不再被写了 —— 这正是本仪器存在的理由。\n`,
  );
}

if (!jestOk) {
  console.error(
    `\n[measure:p019] the instrument's own self-check failed (jest exit ${run.status}).\n` +
      `         仪器自带的自检失败（jest exit ${run.status}）—— 见上面最后 40 行输出。\n` +
      stripAnsi(output)
        .split(/\r?\n/)
        .filter((l) => /●|✕|×|expect|Expected|Received/.test(l))
        .slice(0, 20)
        .join('\n'),
  );
}

process.exit(moved.length > 0 ? 1 : 2);
