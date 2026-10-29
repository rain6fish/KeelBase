#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * e2e 分片 runner：把全部 e2e 套件拆成 4 片依次跑，汇总退出码；带 --coverage 时另出覆盖率。
 *
 * 为什么：全部 e2e 套件（当前 36 个）放进**一次** jest 调用会命中已知的「单进程长跑硬崩」——
 * 进程中途无输出死亡（没有 jest 汇总行），整套 e2e 报假红。分片把每个 jest 进程压到
 * 约 9 个套件以规避，同时保持与单次调用等价的语义：任一片失败 → 整体非 0（不吞退出码）。
 * 跑完所有片再汇总，便于一次看到全部失败片。
 *
 * 分片交给 jest 原生 --shard=N/M（jest 自己按测试文件均分），不在此维护套件清单——
 * 新增 e2e 文件自动纳入。片数调整只需改 SHARDS。
 *
 * 崩溃重试：分片降低但不归零崩溃概率（coverage 模式尤甚，其固定开销使每片更慢）。判据是
 * **该片未产出 jest 汇总行**（`Test Suites:`）——那是 jest 自己没跑完，与「测试断言失败」
 * 可区分；后者一定有汇总行。故只对前者重试，绝不重试真实失败、不掩盖 flaky。
 *
 * 覆盖率必须合并：jest 每次运行都会清空 coverageDirectory，各片若共用目录则只剩最后一片的
 * 数据（那是比不分片更差的假数据）。故各片写自己的目录，跑完用 istanbul 合并成一份 lcov +
 * 摘要。合并库是 jest 自身的传递依赖（同由 lockfile 锁定）；万一缺失会显式报错，不会静默丢数据。
 *
 * 用法：npm run test:e2e（CI 的 test job 与 scripts/dev.sh 都走这条命令）
 *       npm run test:e2e:cov（同上，另出覆盖率）
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

const SHARDS = 4;
const MAX_ATTEMPTS = 3; // 首跑 + 最多 2 次重试（仅针对「未产出汇总行」的崩溃）
const TAIL_BYTES = 256 * 1024; // 只需判定汇总行（在末尾），不必留全量输出
const withCoverage = process.argv.includes('--coverage');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
const covDir = path.join(root, 'coverage-e2e');
const covShards = path.join(covDir, '.shards');

function shardCoverageDir(i) {
  return path.join(covShards, `shard-${i}`);
}

// Output is forwarded live while a tail buffer is kept for the "did jest finish" check. The
// child's exit code, termination signal and wall time are kept as well, so a shard that dies
// without a summary line can be attributed instead of only being called "not a test failure".
// The shard's previous coverage data is cleared before every attempt.
//
// 输出实时转发，同时留尾部缓冲用于判定是否跑完；child 的退出码、终止信号与耗时一并留下，
// 这样「没产出汇总行」的片能被归因，而不是只被说成「非测试失败」。每次尝试前清掉该片上次的覆盖率数据。
function runShard(args, coverageDir) {
  if (coverageDir) fs.rmSync(coverageDir, { recursive: true, force: true });
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-TAIL_BYTES);
    };
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      keep(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      keep(chunk);
    });
    child.on('close', (status, signal) =>
      resolve({
        status,
        signal,
        finished: tail.includes('Test Suites:'),
        seconds: (Date.now() - startedAt) / 1000,
        tail,
      }),
    );
  });
}

// Windows reports hard kills as NTSTATUS values in the exit code; naming the common ones turns
// "died silently" into a fact the reader can act on. On POSIX the same information is in `signal`.
//
// Windows 把硬杀以 NTSTATUS 数值作为退出码上报；给常见的那几个命名，能把「静默死亡」变成读者可
// 据以行动的事实。POSIX 上同样的信息由 `signal` 承载。
const EXIT_CODE_NOTES = {
  3221225477: '0xC0000005 访问冲突——原生模块段错误',
  3221226505: '0xC0000409 栈缓冲越界 / fail-fast 中止',
  3221225725: '0xC00000FD 栈溢出',
  3221225786: '0xC000013A 控制台中断（Ctrl-C）',
  3221225995: '0xC0000142 DLL 初始化失败',
};

function exitSummary(status, signal) {
  if (signal) return `被信号 ${signal} 终止`;
  if (status === null) return '无退出码、无信号';
  const note = EXIT_CODE_NOTES[status];
  return note ? `退出码 ${status}（${note}）` : `退出码 ${status}`;
}

// How far jest got, read off the suite result lines it already printed: with maxWorkers=1 the
// last PASS/FAIL names the last suite that finished, and "none" pins the death to the first one.
//
// jest 已打出的套件结果行显示它跑到哪：maxWorkers=1 时最后一条 PASS/FAIL 即崩溃前跑完的套件，
// 「一条都没有」则把死亡钉在第一个套件之内。
function suiteProgress(tail) {
  const results = tail.split(/\r?\n/).filter((l) => /^(PASS|FAIL) test\//.test(l));
  if (!results.length) return '一个套件也没跑完（死在第一个套件之内）';
  return `已跑完 ${results.length} 个套件，最后一条结果行 ${results[results.length - 1].trim()}（它之后的套件没跑完）`;
}

function reportCrash(label, r, attempt) {
  console.error(`\n⚠ 分片 ${label} 未产出 jest 汇总行——子进程已结束但 jest 没跑完（不是断言失败）`);
  console.error(
    `   退出方式：${exitSummary(r.status, r.signal)} · 耗时 ${r.seconds.toFixed(1)}s · ${suiteProgress(r.tail)}`,
  );
  console.error('   该片最后 20 行输出（完整输出见上方实时日志）：');
  const lines = r.tail.split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines.slice(-20)) console.error(`   │ ${line}`);
  if (attempt < MAX_ATTEMPTS) console.error(`   —— 重试 ${attempt}/${MAX_ATTEMPTS - 1}`);
}

function mergeCoverage() {
  const map = libCoverage.createCoverageMap({});
  let merged = 0;
  for (let i = 1; i <= SHARDS; i++) {
    const f = path.join(shardCoverageDir(i), 'coverage-final.json');
    if (!fs.existsSync(f)) continue;
    map.merge(JSON.parse(fs.readFileSync(f, 'utf8')));
    merged++;
  }
  if (!merged) {
    console.error('\n⚠ 未找到任何分片的覆盖率数据，跳过合并');
    return;
  }
  // lcovonly 的 file 是相对 context.dir 解析的，此处只给文件名
  const ctx = libReport.createContext({ dir: covDir, coverageMap: map });
  istanbulReports.create('lcovonly', { file: 'lcov.info' }).execute(ctx);
  istanbulReports.create('text-summary').execute(ctx);
  fs.rmSync(covShards, { recursive: true, force: true });
  console.log(`\n覆盖率：已合并 ${merged}/${SHARDS} 片 → ${path.relative(root, covDir)}/lcov.info`);
}

const failed = [];
const crashedOut = [];
const lastCrash = {};
for (let i = 1; i <= SHARDS; i++) {
  const label = `${i}/${SHARDS}`;
  console.log(`\n── e2e 分片 ${label}${withCoverage ? '（含覆盖率）' : ''} ──`);
  const args = [jestBin, '--config', './test/jest-e2e.json', '--forceExit', `--shard=${label}`];
  if (withCoverage) {
    args.push('--coverage', '--coverageReporters=json', `--coverageDirectory=${shardCoverageDir(i)}`);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await runShard(args, withCoverage ? shardCoverageDir(i) : null);
    if (r.status === 0 && r.finished) break; // 通过
    if (r.finished) {
      // 有汇总行 ⇒ jest 跑完了，是真实失败：不重试
      failed.push(label);
      break;
    }
    // Every attempt without a summary line is reported with its exit code, signal and tail —
    // retried or not, so the reason is never lost.
    //
    // 每一次「没有汇总行」的尝试都带着退出码、信号与末段输出报出来——无论是否重试，原因都不会丢。
    reportCrash(label, r, attempt);
    if (attempt === MAX_ATTEMPTS) {
      crashedOut.push(label);
      failed.push(label);
      lastCrash[label] = r;
      break;
    }
  }
}

// 即使有片失败也合并——部分覆盖率仍有参考价值；是否通过由下面的退出码决定
if (withCoverage) mergeCoverage();

if (failed.length) {
  const crashed = crashedOut.length
    ? `（其中 ${crashedOut
        .map((label) => `${label}：${exitSummary(lastCrash[label].status, lastCrash[label].signal)}`)
        .join('、')} 为 jest 未跑完的崩溃，已重试 ${MAX_ATTEMPTS - 1} 次）`
    : '';
  console.error(`\n✗ e2e 未通过：分片 ${failed.join('、')} 失败（共 ${SHARDS} 片）${crashed}`);
  process.exit(1);
}
console.log(`\n✓ e2e 全部通过（${SHARDS} 片）`);
