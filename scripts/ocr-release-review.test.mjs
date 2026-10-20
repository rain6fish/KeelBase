#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Guards for the release OCR wrapper: the numbers it reports must match the session log.
 *
 * The wrapper is only useful if its cost line is trustworthy. These tests pin the preview parser,
 * the price arithmetic against the 2026-10-18 release session, the default exclude set, and the
 * session-log aggregation.
 *
 * 守住发布 OCR wrapper 的账：它报出来的数必须对得上会话日志。测试固定预览解析、按
 * 2026-10-18 发布会话校准的价格计算、默认排除集，以及会话日志聚合。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildExcludes,
  computeCost,
  parseArgs,
  parsePreview,
  parseSession,
} from './ocr-release-review.mjs';

test('parsePreview reads the changed and selected counts', () => {
  const text = [
    'Preview: 735 file(s) changed  |  +46147  -8293',
    '',
    'Will review (502):',
    '  [M]  .github/workflows/ci.yml  +221  -0',
  ].join('\n');
  assert.deepEqual(parsePreview(text), { changed: 735, willReview: 502 });
});

test('computeCost matches the 2026-10-18 release session', () => {
  const cost = computeCost(267430296, 257149184, 3624095, { cache: 0.02, miss: 1, out: 4 });
  assert.equal(cost.toFixed(2), '29.92');
});

test('computeCost never bills negative uncached input', () => {
  const cost = computeCost(100, 200, 0, { cache: 0.02, miss: 1, out: 4 });
  assert.equal(cost, (200 / 1e6) * 0.02);
});

test('buildExcludes keeps the low-value defaults and appends extras once', () => {
  const excludes = buildExcludes({ noDefaultExcludes: false, exclude: ['**/*.json', 'ops/**'] });
  assert.ok(excludes.includes('**/i18n/**'));
  assert.ok(excludes.includes('ops/**'));
  assert.equal(excludes.filter((p) => p === '**/*.json').length, 1);
});

test('buildExcludes can drop the defaults', () => {
  assert.deepEqual(buildExcludes({ noDefaultExcludes: true, exclude: ['ops/**'] }), ['ops/**']);
});

test('parseArgs defaults to the cheap release profile', () => {
  const opts = parseArgs(['--from', 'v1.1.0']);
  assert.equal(opts.to, 'HEAD');
  assert.equal(opts.effort, 'low');
  assert.equal(opts.maxTokens, 120000);
  assert.equal(opts.budget, 120000000);
});

test('parseArgs requires a range, commit or workspace', () => {
  assert.throws(() => parseArgs([]), /one of --from, --commit or --workspace is required/);
});

test('parseArgs rejects a commit mixed with a range', () => {
  assert.throws(
    () => parseArgs(['--commit', 'abc123', '--from', 'v1.0.0']),
    /use either --commit or --from\/--workspace/,
  );
});

test('parseSession aggregates usage, groups, comments and failures', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-release-review-'));
  const file = path.join(dir, 'session.jsonl');
  const lines = [
    { type: 'session_start', cwd: 'D:/repo', model: 'deepseek-v4-flash', diffFrom: 'v1.1.0', diffTo: 'HEAD' },
    { type: 'llm_response', taskType: 'main_task', filePath: 'a.ts,b.ts', usage: { prompt_tokens: 100, cache_read_tokens: 80, completion_tokens: 10 } },
    { type: 'llm_response', taskType: 'main_task', filePath: 'a.ts,b.ts', usage: { prompt_tokens: 50, cache_read_tokens: 40, completion_tokens: 5 } },
    { type: 'review_item_done', filePath: 'a.ts', comments: [{}, {}] },
    { type: 'review_item_done', filePath: 'b.ts', comments: [] },
    { type: 'review_item_failed', filePath: 'c.ts' },
    { type: 'llm_error' },
    { type: 'session_end', duration_seconds: 12 },
  ];
  fs.writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

  const summary = await parseSession(file);
  assert.equal(summary.range, 'v1.1.0..HEAD');
  assert.equal(summary.model, 'deepseek-v4-flash');
  assert.equal(summary.requests, 3);
  assert.equal(summary.promptTokens, 150);
  assert.equal(summary.cacheReadTokens, 120);
  assert.equal(summary.completionTokens, 15);
  assert.equal(summary.groups.size, 1);
  assert.equal(summary.selected.size, 3);
  assert.equal(summary.done.size, 2);
  assert.equal(summary.comments, 2);
  assert.equal(summary.failed.size, 1);
  assert.equal(summary.durationSeconds, 12);

  fs.rmSync(dir, { recursive: true, force: true });
});
