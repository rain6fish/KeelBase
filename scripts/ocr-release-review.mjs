#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Review the release diff with OpenCodeReview under a fixed token budget.
 *
 * Run manually before a release. The OCR call needs an API key, so this is deliberately not wired
 * into CI or `scripts/release-gate.sh`. The previous release review (`v1.1.0..HEAD`, default
 * `medium` = two rounds) spent 267.4M input tokens and about CNY 29.9 in 45 minutes. This wrapper
 * pins the cheap profile — one round, a 120k per-group context ceiling, a hard total budget, and an
 * exclude list for files the other three review layers already cover — then reports actual usage.
 *
 * 发版前手动运行。OCR 需要 API key，所以有意不接 CI / `scripts/release-gate.sh`。上一轮
 * `v1.1.0..HEAD` 用默认 `medium`（两轮）花了 267.4M 输入 token、约 29.9 元、45 分钟。本脚本固定
 * 省 token 档：单轮、单组 120k 上下文上限、总预算硬顶，并排除另外三层已覆盖的低价值文件；
 * 跑完打印真实用量。
 *
 * Usage / 用法:
 *   node scripts/ocr-release-review.mjs --from v1.1.0 --to HEAD
 *   node scripts/ocr-release-review.mjs --from v1.1.0 --to HEAD --dry-run
 *   node scripts/ocr-release-review.mjs --from v1.1.0 --to HEAD --resume <session-id>
 *
 * Exit codes / 退出码: 0 complete, 2 partial (some files failed), 1 failed or unusable.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// Prices are CNY per million tokens. They mirror docs/manual/release-precheck.md and the
// 2026-10-09 cost review; override with OCR_PRICE_* when the provider changes.
// 单价为「元 / 百万 token」，口径见 release-precheck 与 2026-10-09 成本方案；换供应商时用 OCR_PRICE_* 覆盖。
const PRICE = {
  cache: numberFromEnv('OCR_PRICE_CACHE', 0.02),
  miss: numberFromEnv('OCR_PRICE_MISS', 1.0),
  out: numberFromEnv('OCR_PRICE_OUT', 4.0),
};

// Files the other three review layers already cover well, and which cost a full group each in OCR.
// 另外三层已经覆盖得不错、却在 OCR 里各占一个分组的低价值文件。
const DEFAULT_EXCLUDES = [
  '**/*.json',
  '**/*.lock',
  '**/*.scss',
  '**/*.css',
  '**/i18n/**',
  '.keelbase/**',
  'specs/**',
  'Server-NestJS/specs/**',
];

const BOOLEAN_FLAGS = new Set(['--dry-run', '--preview', '--no-default-excludes', '--help', '-h', '--workspace']);

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got ${raw}`);
  return n;
}

const HELP = `Review the release diff with OpenCodeReview under a token budget.

Usage:
  node scripts/ocr-release-review.mjs --from <ref> [--to <ref>] [options]
  node scripts/ocr-release-review.mjs --commit <sha> [options]
  node scripts/ocr-release-review.mjs --workspace [options]

Options:
  --from <ref>          source ref of the diff (e.g. the previous release tag)
  --to <ref>            target ref (default: HEAD)
  --commit <sha>        review one commit instead of a range
  --workspace           review staged + unstaged + untracked changes
  --effort <level>      low | medium | high (default: low; one round instead of two)
  --max-tokens <n>      per-group prompt ceiling (default: 120000)
  --budget <n>          total token budget, input + output (default: 120000000)
  --exclude <patterns>  extra comma-separated gitignore patterns
  --no-default-excludes keep the built-in low-value excludes off
  --resume <session>    resume a previous OCR session
  --repo <dir>          repository root (default: this checkout)
  --output <file>       JSON result path (default: artifacts/ocr/ocr-review-<timestamp>.json)
  --dry-run, --preview  only print the file selection; no LLM call
  -h, --help            show this help

Environment:
  OCR_BIN               path to the ocr launcher, when it is not on PATH
  OCR_PRICE_CACHE       CNY per million cached input tokens (default: 0.02)
  OCR_PRICE_MISS        CNY per million uncached input tokens (default: 1.00)
  OCR_PRICE_OUT         CNY per million output tokens (default: 4.00)
`;

export function parseArgs(argv) {
  const opts = {
    from: null,
    to: 'HEAD',
    commit: null,
    workspace: false,
    effort: 'low',
    maxTokens: 120000,
    budget: 120000000,
    exclude: [],
    noDefaultExcludes: false,
    resume: null,
    repo: ROOT,
    output: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const eq = raw.indexOf('=');
    const key = eq > 0 ? raw.slice(0, eq) : raw;

    if (BOOLEAN_FLAGS.has(key)) {
      if (key === '--dry-run' || key === '--preview') opts.dryRun = true;
      if (key === '--no-default-excludes') opts.noDefaultExcludes = true;
      if (key === '--workspace') opts.workspace = true;
      if (key === '--help' || key === '-h') opts.help = true;
      continue;
    }

    const value = eq > 0 ? raw.slice(eq + 1) : argv[(i += 1)];
    if (value === undefined) throw new Error(`${key} needs a value`);

    switch (key) {
      case '--from': opts.from = value; break;
      case '--to': opts.to = value; break;
      case '--commit': opts.commit = value; break;
      case '--effort': opts.effort = value; break;
      case '--max-tokens': opts.maxTokens = Number(value); break;
      case '--budget': opts.budget = Number(value); break;
      case '--exclude':
        opts.exclude.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--resume': opts.resume = value; break;
      case '--repo': opts.repo = value; break;
      case '--output': opts.output = value; break;
      default: throw new Error(`unknown argument: ${raw}`);
    }
  }

  if (opts.help) return opts;
  if (!['low', 'medium', 'high'].includes(opts.effort)) {
    throw new Error(`--effort must be low, medium or high, got ${opts.effort}`);
  }
  if (!Number.isInteger(opts.maxTokens) || opts.maxTokens <= 0) {
    throw new Error(`--max-tokens must be a positive integer, got ${opts.maxTokens}`);
  }
  if (!Number.isInteger(opts.budget) || opts.budget <= 0) {
    throw new Error(`--budget must be a positive integer, got ${opts.budget}`);
  }
  if (opts.commit && (opts.from || opts.workspace)) {
    throw new Error('use either --commit or --from/--workspace, not both');
  }
  if (!opts.commit && !opts.from && !opts.workspace) {
    throw new Error('one of --from, --commit or --workspace is required');
  }
  if (opts.workspace && opts.from) {
    throw new Error('use either --workspace or --from, not both');
  }
  opts.repo = path.resolve(opts.repo);
  return opts;
}

export function buildExcludes(opts) {
  const all = opts.noDefaultExcludes ? [] : [...DEFAULT_EXCLUDES];
  for (const pattern of opts.exclude) if (!all.includes(pattern)) all.push(pattern);
  return all;
}

export function parsePreview(text) {
  const changed = Number((text.match(/Preview:\s+(\d+)\s+file\(s\)\s+changed/) || [])[1] || 0);
  const willReview = Number((text.match(/Will review \((\d+)\)/) || [])[1] || 0);
  return { changed, willReview };
}

export function computeCost(promptTokens, cacheReadTokens, completionTokens, price = PRICE) {
  const uncached = Math.max(0, promptTokens - cacheReadTokens);
  return (cacheReadTokens / 1e6) * price.cache
    + (uncached / 1e6) * price.miss
    + (completionTokens / 1e6) * price.out;
}

export function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return 'unknown';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join('');
}

function globalNodeModules() {
  if (process.env.npm_config_prefix) {
    return [path.join(process.env.npm_config_prefix, 'node_modules')];
  }
  if (process.platform === 'win32') {
    // npm's Windows global prefix is %APPDATA%\npm; asking `npm root -g` would need a shell,
    // which Node 24 flags as unsafe. Probing the directory is quieter and just as reliable.
    // npm 的 Windows 全局前缀是 %APPDATA%\npm；调 `npm root -g` 需要 shell，Node 24 会报不安全告警。
    // 直接探测目录更安静，也同样可靠。
    return process.env.APPDATA
      ? [path.join(process.env.APPDATA, 'npm', 'node_modules')]
      : [];
  }
  return ['/usr/local/lib/node_modules', '/usr/lib/node_modules'];
}

function resolveOcr() {
  if (process.env.OCR_BIN) return { cmd: process.env.OCR_BIN, prefix: [], shell: false };

  // Prefer the npm launcher so Windows never has to quote `.cmd` arguments through a shell.
  // 优先走 npm 的 JS launcher，避免 Windows 上经 shell 拼 `.cmd` 参数。
  for (const dir of globalNodeModules()) {
    const launcher = path.join(dir, '@alibaba-group', 'open-code-review', 'bin', 'ocr.js');
    if (fs.existsSync(launcher)) return { cmd: process.execPath, prefix: [launcher], shell: false };
  }

  return {
    cmd: process.platform === 'win32' ? 'ocr.cmd' : 'ocr',
    prefix: [],
    shell: process.platform === 'win32',
  };
}

function runOcr(ocr, args, { capture = false } = {}) {
  return spawnSync(ocr.cmd, [...ocr.prefix, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: ocr.shell,
    stdio: capture ? 'pipe' : 'inherit',
  });
}

function rangeArgs(opts) {
  if (opts.commit) return ['--commit', opts.commit];
  if (opts.workspace) return [];
  return ['--from', opts.from, '--to', opts.to];
}

function readFirstLine(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString('utf8').split('\n')[0];
  } finally {
    fs.closeSync(fd);
  }
}

function samePath(a, b) {
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  return norm(a) === norm(b);
}

function findSessionFile(repo, startedAt) {
  const base = path.join(os.homedir(), '.opencodereview', 'sessions');
  if (!fs.existsSync(base)) return null;

  const candidates = [];
  for (const dir of fs.readdirSync(base)) {
    const full = path.join(base, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(full, name);
      const stat = fs.statSync(file);
      if (stat.mtimeMs + 5000 < startedAt) continue;
      candidates.push({ file, mtime: stat.mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);

  for (const candidate of candidates) {
    try {
      const first = JSON.parse(readFirstLine(candidate.file));
      if (first.type === 'session_start' && samePath(first.cwd, repo)) return candidate.file;
    } catch {
      // A half-written line is not a reason to stop looking.
      // 半行写坏不该中断查找。
    }
  }
  return candidates[0]?.file || null;
}

export async function parseSession(file) {
  const summary = {
    model: null,
    range: null,
    requests: 0,
    promptTokens: 0,
    cacheReadTokens: 0,
    completionTokens: 0,
    comments: 0,
    groups: new Set(),
    selected: new Set(),
    done: new Set(),
    failed: new Set(),
    durationSeconds: null,
  };

  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.type === 'llm_response') {
      const usage = record.usage || {};
      summary.requests += 1;
      summary.promptTokens += usage.prompt_tokens || 0;
      summary.cacheReadTokens += usage.cache_read_tokens || 0;
      summary.completionTokens += usage.completion_tokens || 0;
      if (record.taskType === 'main_task' && record.filePath) summary.groups.add(record.filePath);
    } else if (record.type === 'llm_error') {
      summary.requests += 1;
    } else if (record.type === 'review_item_done') {
      summary.done.add(record.filePath);
      summary.selected.add(record.filePath);
      summary.comments += (record.comments || []).length;
    } else if (record.type === 'review_item_failed') {
      summary.failed.add(record.filePath);
      summary.selected.add(record.filePath);
    } else if (record.type === 'session_start') {
      summary.model = record.model || null;
      summary.range = record.diffFrom
        ? `${record.diffFrom}..${record.diffTo}`
        : (record.diffCommit || 'workspace');
    } else if (record.type === 'session_end') {
      summary.durationSeconds = record.duration_seconds ?? null;
    }
  }
  return summary;
}

function statusOf(summary) {
  if (summary.failed.size > 0 && summary.done.size === 0) return 'failed';
  if (summary.failed.size > 0) return 'partial';
  return summary.done.size > 0 ? 'complete' : 'failed';
}

function writeSummary(summary, opts, sessionFile, output, cost) {
  const dir = path.join(ROOT, 'artifacts', 'ocr');
  fs.mkdirSync(dir, { recursive: true });
  const sessionId = path.basename(sessionFile, '.jsonl');
  const record = {
    sessionId,
    repo: opts.repo,
    range: summary.range,
    model: summary.model,
    effort: opts.effort,
    maxTokens: opts.maxTokens,
    budget: opts.budget,
    groups: summary.groups.size,
    files: summary.selected.size,
    done: summary.done.size,
    comments: summary.comments,
    failed: summary.failed.size,
    requests: summary.requests,
    promptTokens: summary.promptTokens,
    cacheReadTokens: summary.cacheReadTokens,
    completionTokens: summary.completionTokens,
    costCny: Number(cost.toFixed(2)),
    durationSeconds: summary.durationSeconds,
    status: statusOf(summary),
    resultFile: output,
    sessionFile,
  };
  const file = path.join(dir, `ocr-review-${sessionId}.summary.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  const ocr = resolveOcr();
  const excludes = buildExcludes(opts);
  const previewArgs = ['review', '--repo', opts.repo, ...rangeArgs(opts), '--preview'];
  if (excludes.length) previewArgs.push('--exclude', excludes.join(','));

  const preview = runOcr(ocr, previewArgs, { capture: true });
  if (preview.status !== 0) {
    process.stderr.write(preview.stderr || '');
    throw new Error(`ocr preview exited ${preview.status}`);
  }
  const selection = parsePreview(`${preview.stdout}\n${preview.stderr}`);
  process.stdout.write(
    `[ocr] preview: ${selection.changed} changed -> ${selection.willReview} selected `
    + `(${selection.changed - selection.willReview} excluded)\n`,
  );
  if (selection.willReview === 0) {
    process.stdout.write('[ocr] nothing to review\n');
    return;
  }
  if (opts.dryRun) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.resolve(
    opts.output || path.join(ROOT, 'artifacts', 'ocr', `ocr-review-${stamp}.json`),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const args = [
    'review', '--repo', opts.repo, ...rangeArgs(opts),
    '--effort', opts.effort,
    '--max-tokens', String(opts.maxTokens),
    '--max-tokens-budget', String(opts.budget),
    '--audience', 'agent',
    '--format', 'json',
    '--output', output,
  ];
  if (excludes.length) args.push('--exclude', excludes.join(','));
  if (opts.resume) args.push('--resume', opts.resume);

  process.stdout.write(
    `[ocr] review: effort=${opts.effort}, max-tokens=${opts.maxTokens}, `
    + `budget=${formatTokens(opts.budget)}, output=${output}\n`,
  );
  const startedAt = Date.now();
  const review = runOcr(ocr, args);
  if (review.error) throw new Error(`cannot run ocr: ${review.error.message}`);

  const sessionFile = findSessionFile(opts.repo, startedAt);
  if (!sessionFile) {
    process.stderr.write('[ocr] no session file found; usage unavailable\n');
    process.exitCode = review.status === 0 ? 0 : 1;
    return;
  }

  const summary = await parseSession(sessionFile);
  const cost = computeCost(
    summary.promptTokens,
    summary.cacheReadTokens,
    summary.completionTokens,
  );
  const status = statusOf(summary);
  const summaryFile = writeSummary(summary, opts, sessionFile, output, cost);

  process.stdout.write(
    `[ocr] ${status}: ${summary.groups.size} groups / ${summary.selected.size} files `
    + `(${summary.done.size} done, ${summary.failed.size} failed) / ${summary.comments} comments\n`,
  );
  process.stdout.write(
    `[ocr] tokens: ${formatTokens(summary.promptTokens)} in `
    + `(${formatTokens(summary.cacheReadTokens)} cached, `
    + `${formatTokens(Math.max(0, summary.promptTokens - summary.cacheReadTokens))} miss) / `
    + `${formatTokens(summary.completionTokens)} out / ${summary.requests} requests\n`,
  );
  process.stdout.write(
    `[ocr] cost: CNY ${cost.toFixed(2)} (cache ${PRICE.cache} / miss ${PRICE.miss} / out ${PRICE.out} per M)\n`,
  );
  process.stdout.write(
    `[ocr] duration: ${formatDuration(summary.durationSeconds)}; session: ${sessionFile}\n`,
  );
  process.stdout.write(`[ocr] summary: ${summaryFile}\n`);
  process.stdout.write(
    `[ocr] record: OCR 成本：${summary.groups.size} 组 / ${summary.selected.size} 文件 / `
    + `${formatTokens(summary.promptTokens)} in + ${formatTokens(summary.completionTokens)} out / `
    + `¥${cost.toFixed(2)}（session ${path.basename(sessionFile, '.jsonl')}，effort ${opts.effort}）\n`,
  );

  if (review.status !== 0) process.exitCode = 1;
  else if (status === 'failed') process.exitCode = 1;
  else if (status === 'partial') process.exitCode = 2;
  else process.exitCode = 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
