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
 * Exit codes — four states, because "the numbers moved", "the instrument never produced one" and
 * "there was nothing to compare it with" are different problems, and only the first is about the
 * product:
 *
 *   0  every class on every dimension matches the baseline
 *   1  at least one reading moved away from the baseline (the interesting failure)
 *   2  the instrument produced no reading at all — it could not be started, it died, it timed out,
 *      or it finished without printing a `MACHINE` line. Every dead run is reported with its exit
 *      code, signal and duration. A run that *died* is retried once — this repository's jest is
 *      known to sometimes abort mid-run with a native fail-fast (exit 3221226505, no output at
 *      all), which is the same death `scripts/run-e2e-shards.mjs` retries; a run that finished and
 *      merely failed its own tests is not retried.
 *   3  a reading was printed but there is nothing to compare it with — no baseline, or one that is
 *      missing / unreadable / malformed.
 *   4  the readings match, but the instrument's own self-check (`⑨ 反向可证`) failed: the numbers
 *      are the ones we know, and the instrument can no longer show it would have noticed if they
 *      were not.
 *
 * What this command does **not** cover: a matching baseline is not a judgement of the product, only
 * the statement that the numbers are the ones last reviewed; it measures the seven event classes
 * the instrument drives and no others; it cannot tell whether the baseline itself was taken on a
 * healthy product (`git log` on the baseline file is the only evidence of that); and it never
 * retries a *moved* reading — a mismatch is reported, not re-rolled.
 *
 * The instrument's own self-check is expected to go red alongside a real regression, because it
 * hard-codes numbers measured on the healthy product. So a failing jest run is *not* treated as
 * "no reading": the machine line is printed before that step, and the readings are compared and
 * reported first. The self-check failure is added below them as a second line of evidence rather
 * than replacing the real one.
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
 * 退出码四个状态 ——「数动了」「仪器根本没产出读数」「没有可拿来比的东西」是三个问题，只有第一个
 * 是在说产品：
 *
 *   0  每一类、每一维都与基线一致
 *   1  至少一个读数离开了基线（真正要看的那个失败）
 *   2  仪器根本没产出读数 —— 起不来、中途死了、超时、或跑完却没打 `MACHINE` 行。每一次死掉的运行都会
 *      报出退出码、信号与耗时。**死掉**的那一次会重跑一次 —— 本仓的 jest 已知会以原生 fail-fast 中途
 *      死掉（退出码 3221226505、没有任何输出），与 `scripts/run-e2e-shards.mjs` 重试的是同一种死法；
 *      跑完而只是自身用例失败的不重跑。
 *   3  打出了读数，却没有可与之比较的东西 —— 没有基线，或基线缺失/读不了/形状不对
 *   4  读数与基线一致，但仪器自带的自检（`⑨ 反向可证`）失败：数还是我们认识的那几个，而仪器已经无法
 *      证明「若它们不是，它会看出来」
 *
 * 这条命令**不覆盖**什么：基线一致**不是**对产品的判断，只是「数仍是上次评审过的那几个」这句话；它只
 * 量仪器驱动的那七个事件类，别的一概不量；它无法判断基线本身是否取自健康产品（那只有基线文件的
 * `git log` 能作证）；它也**从不**重跑一个**动了的**读数 —— 不一致要报出来，不是再掷一次。
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

const EXIT = {
  MATCH: 0,
  MOVED: 1,
  NO_RUN: 2, // the instrument produced no reading at all
  NO_COMPARE: 3, // it produced one, but there is nothing to compare it with
  SELF_CHECK: 4, // readings match; the instrument's own self-check failed
};

/** One retry, and only for a run that *died* — never for a mismatch or a deterministic failure. */
const MAX_ATTEMPTS = 2;
/** A hung child would otherwise surface as an opaque workflow cancellation ~5 minutes later. */
const TIMEOUT_MS = 10 * 60 * 1000;

function fail(code, message) {
  console.error(`\n[measure:p019] ${message}`);
  process.exit(code);
}

// Windows reports hard kills as NTSTATUS values in the exit code; naming the common ones turns
// "died silently" into a fact the reader can act on. On POSIX the same information is in `signal`.
// Same table as `run-e2e-shards.mjs`, which had the identical blind spot.
//
// Windows 把硬杀以 NTSTATUS 数值作为退出码上报；给常见的那几个命名，能把「静默死亡」变成读者可据以
// 行动的事实。POSIX 上同样的信息由 `signal` 承载。同一张表也在 `run-e2e-shards.mjs` 里 —— 那里曾有过
// 一模一样的盲区。
const EXIT_CODE_NOTES = {
  3221225477: '0xC0000005 访问冲突——原生模块段错误',
  3221226505: '0xC0000409 栈缓冲越界 / fail-fast 中止',
  3221225725: '0xC00000FD 栈溢出',
  3221225786: '0xC000013A 控制台中断（Ctrl-C）',
  3221225995: '0xC0000142 DLL 初始化失败',
};

/**
 * How the child ended, as one clause a reader can act on — generated once in both languages so the
 * two blocks below cannot drift apart (the Chinese block must not carry an English phrase).
 *
 * 子进程是怎么结束的，一句话、读者可据以行动 —— 两种语言由同一处生成，下面两块因此不会各说各话
 * （中文块里不该夹着英文短语）。
 */
function endingParts(run) {
  if (run.error) {
    const code = run.error.code ?? run.error.name;
    if (code === 'ETIMEDOUT') {
      return {
        en: `did not finish within ${TIMEOUT_MS / 60000} minutes (killed)`,
        zh: `超过 ${TIMEOUT_MS / 60000} 分钟未跑完（已被终止）`,
      };
    }
    return {
      en: `could not be started — ${code}: ${run.error.message}`,
      zh: `起不来 —— ${code}：${run.error.message}`,
    };
  }
  if (run.signal) return { en: `killed by signal ${run.signal}`, zh: `被信号 ${run.signal} 终止` };
  if (run.status === null) return { en: 'no exit code and no signal', zh: '既无退出码也无信号' };
  const note = EXIT_CODE_NOTES[run.status];
  return note
    ? { en: `exit ${run.status} (${note})`, zh: `退出码 ${run.status}（${note}）` }
    : { en: `exit ${run.status}`, zh: `退出码 ${run.status}` };
}
const howItEnded = (run) => endingParts(run).en;
const howItEndedZh = (run) => endingParts(run).zh;

/** jest's own end-of-run summary line. Its absence, not an exit code, is what says "it never finished". */
function jestSummary(output) {
  return (stripAnsi(output).match(/^Tests: .+$/m) ?? [])[0];
}

/**
 * A run that never finished, rather than one that finished and failed. The discriminator is jest's
 * own summary line — the same one `run-e2e-shards.mjs` uses — and not the exit code: Windows
 * reports a force-killed process as a plain `exit 1`, indistinguishable from jest's own "a test
 * failed", while jest always prints `Tests: …` when it gets that far. Only a run without that line
 * is retried; a deterministic failure (bad test, missing dependency, timeout) is reported as is.
 *
 * 「没跑完」而不是「跑完但失败」。判据是 jest 自己的汇总行 —— 与 `run-e2e-shards.mjs` 同一个 —— 而不是
 * 退出码：Windows 会把被强杀的进程报成普通的 `exit 1`，与 jest 自己的「有用例失败」同码；而 jest 只要
 * 跑到那一步就一定打 `Tests: …`。只对没有这一行的运行重跑；确定性失败（用例坏、缺依赖、超时）照实报。
 */
function neverFinished(run, output) {
  if (run.error) return false; // could not start / timed out: the second run says the same thing
  return jestSummary(output) === undefined;
}

// ── run the instrument ────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(JEST)) {
  fail(
    EXIT.NO_RUN,
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
function runInstrument() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'p019-measure-'));
  const started = Date.now();
  let run;
  try {
    run = spawnSync(process.execPath, [JEST, '--config', 'test/jest-e2e.json', '--testRegex', TEST_REGEX], {
      cwd: ROOT,
      env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: TIMEOUT_MS,
    });
  } finally {
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch (err) {
      console.error(`[measure:p019] could not remove the scratch directory ${scratch}: ${err.message}`);
    }
  }
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  return {
    run,
    output,
    elapsed: ((Date.now() - started) / 1000).toFixed(1),
    machine: machineReadings(output),
  };
}

// A run that died before printing is retried once — the crash this repository's jest is prone to
// (a native fail-fast in node.exe, exit 3221226505, no output at all) is random, and re-running it
// is what `run-e2e-shards.mjs` does for the identical symptom. Every dead attempt is printed as
// such, so the retry leaves a record instead of hiding one.
//
// 在打印之前就死掉的运行会重跑一次 —— 本仓 jest 会撞上的那个崩溃（node.exe 里的原生 fail-fast，退出码
// 3221226505，完全没有输出）是随机的，`run-e2e-shards.mjs` 对同一个症状就是这么做的。每一次死掉的尝试都
// 会照实打印出来，所以重跑留下的是记录，而不是把记录藏起来。
const attempts = [];
for (;;) {
  attempts.push(runInstrument());
  const last = attempts[attempts.length - 1];
  if (last.machine) break;
  if (attempts.length >= MAX_ATTEMPTS || !neverFinished(last.run, last.output)) break;
  console.error(
    `\n[measure:p019] attempt ${attempts.length} produced no reading — ${howItEnded(last.run)} after ${last.elapsed}s, and no jest summary line (it was terminated mid-run).\n` +
      `         Running the instrument once more; a dead process is not a reading, and not a moved one either.\n` +
      `         第 ${attempts.length} 次没有产出读数 —— ${howItEndedZh(last.run)}，耗时 ${last.elapsed}s，且没有 jest 汇总行（中途被终止）。\n` +
      `         再跑一次；死掉的进程既不是读数，也不是「读数动了」。`,
  );
}

const last = attempts[attempts.length - 1];
const { run, output, elapsed } = last;
const jestOk = run.status === 0;

// ── read the machine line ─────────────────────────────────────────────────────────────────────────
const machine = last.machine;
if (!machine) {
  const tail = output.split(/\r?\n/).filter((l) => l.trim()).slice(-40).join('\n');
  if (tail) console.error(tail);

  // jest prints a summary line when it *finished* (some test failed); a process killed mid-run does
  // not. Telling the two apart is the whole point of reporting the child's exit status.
  //
  // jest 跑完（有用例失败）会打汇总行；中途被杀掉的进程不会。分开这两者，正是报告子进程退出码的全部意义。
  const summary = jestSummary(output);
  const ending =
    summary !== undefined
      ? `${howItEnded(run)} after ${Math.round(elapsed)}s, and jest finished — \`${summary}\` — so the instrument ran but never reached its ⑧ step, where the reading is printed.`
      : `${howItEnded(run)} after ${Math.round(elapsed)}s, with no jest summary line — the process was terminated or aborted mid-run, it did not fail a test.`;
  const dead = attempts.slice(0, -1);
  const earlierEn =
    dead.length > 0
      ? `\n         earlier attempt(s): ${dead.map((a, i) => `#${i + 1} ${howItEnded(a.run)} after ${a.elapsed}s`).join('; ')}`
      : '';
  const earlierZh =
    dead.length > 0
      ? `\n         更早的尝试：${dead.map((a, i) => `第 ${i + 1} 次 ${howItEndedZh(a.run)}，耗时 ${a.elapsed}s`).join('；')}`
      : '';

  fail(
    EXIT.NO_RUN,
    'the instrument produced no reading (exit 2 — not "a reading moved", and not your baseline).\n' +
      `         how it ended: ${ending}${earlierEn}\n` +
      '         what is missing: the `MACHINE {...}` line, so there is nothing to compare.\n' +
      '         Nothing above is a statement about the product — the two readings were not taken.\n' +
      '         仪器没有产出读数（exit 2 —— 不是「读数动了」，也不是基线的问题）。\n' +
      `         它怎么结束的：${howItEndedZh(run)}，耗时 ${Math.round(elapsed)}s${summary !== undefined ? `；jest 跑完了（${summary}），说明仪器跑了、但没走到打印读数的 ⑧ 步` : '，且没有 jest 汇总行 —— 进程是中途被终止或中止的，不是用例失败'}${earlierZh}\n` +
      '         缺什么：`MACHINE {...}` 那一行，因此没有可比对的东西。\n' +
      '         上面任何一条都不是对产品的判断 —— 两维读数根本没有取到。',
  );
}
if (machine.__parseError) {
  fail(
    EXIT.NO_COMPARE,
    `a MACHINE line was printed but could not be parsed: ${machine.__parseError}\n` +
      `         打出了 MACHINE 行，但解析不了：${machine.__parseError}`,
  );
}
if (!Array.isArray(machine.readings) || machine.readings.length === 0) {
  fail(
    EXIT.NO_COMPARE,
    'a MACHINE line was printed but it carries no readings.\n' +
      '         打出了 MACHINE 行，但里面一条读数也没有。',
  );
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
  fail(
    EXIT.NO_COMPARE,
    `a reading was taken but there is no baseline at ${path.relative(ROOT, BASELINE)} — pin one with \`npm run measure:p019 -- --update\`.\n` +
      `         读数取到了，但没有基线可比（${path.relative(ROOT, BASELINE)}）—— 用 \`npm run measure:p019 -- --update\` 钉一份。`,
  );
}
let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
} catch (err) {
  fail(
    EXIT.NO_COMPARE,
    `a reading was taken, but the baseline could not be read as JSON: ${err.message}\n` +
      `         读数取到了，但基线读不成 JSON：${err.message}`,
  );
}
if (!Array.isArray(baseline.readings)) {
  fail(
    EXIT.NO_COMPARE,
    'a reading was taken, but the baseline has no `readings` array.\n' +
      '         读数取到了，但基线里没有 `readings` 数组。',
  );
}

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
      `${path.relative(process.cwd(), BASELINE)} (${elapsed}s` +
      `${attempts.length > 1 ? `, attempt ${attempts.length} of ${MAX_ATTEMPTS} — see the notice above` : ''})`,
  );
  process.exit(EXIT.MATCH);
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
    `\n[measure:p019] the readings match, but the instrument's own self-check failed (${howItEnded(run)}).\n` +
      `         Exit 4: the numbers are the ones we know; what broke is the instrument's ability to show\n` +
      `         it would have noticed if they were not (the ⑨ step mutates in-memory copies and expects\n` +
      `         the counts to fall). See the last 40 lines below.\n` +
      `         读数与基线一致，但仪器自带的自检失败（${howItEndedZh(run)}）。\n` +
      `         exit 4：数还是我们认识的那几个；坏掉的是「若它们不是，仪器会看出来」这件事（⑨ 步在内存副本\n` +
      `         上抹列，期待计数掉下来）。见下面最后 40 行输出。\n` +
      stripAnsi(output)
        .split(/\r?\n/)
        .filter((l) => /●|✕|×|expect|Expected|Received/.test(l))
        .slice(0, 20)
        .join('\n'),
  );
}

process.exit(moved.length > 0 ? EXIT.MOVED : jestOk ? EXIT.MATCH : EXIT.SELF_CHECK);
