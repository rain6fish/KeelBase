// SPDX-License-Identifier: Apache-2.0

/**
 * D-2 单动作证据报告渲染测试（docs/evidence-report.spec.md §7）。
 * 覆盖：无外链 / 结论正确（PASS·FAIL·篡改定位）/ 缺失段标注 / 签名缺省 /
 * i18n 中英并列与 --lang 覆盖 / 确定性 / 无新依赖。
 * 运行：node --test scripts/*.test.mjs（npm run cli:test，CI cli-test job）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderHtml, escapeHtml, pair } from '../Server-NestJS/scripts/lib/evidence-report-html.mjs';
import { chainHash } from '../Server-NestJS/scripts/lib/protocol-algorithms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = resolve(__dirname, '../Server-NestJS/scripts');
const SAMPLE_V3 = resolve(__dirname, '../Server-NestJS/specs/protocol/schemas/v2/samples/evidence-package.json');
const KEY = 'test-audit-hmac-key-0123456789';

const EXT_LINK_RE = /https?:\/\/|<script\s+src|@import\s+url\(/;

/** 由样例改造成「结构 PASS」的 v3 包：锚 hash 归一 64hex（样例 side-effect 锚为示意值）+ digest 自洽。 */
function passStructurePkg() {
  const pkg = JSON.parse(readFileSync(SAMPLE_V3, 'utf8'));
  for (const a of pkg.root.anchors) {
    if (a.kind === 'side-effect') a.hash = createHash('sha256').update(JSON.stringify(pkg.effect)).digest('hex');
  }
  pkg.root.digest = createHash('sha256').update(JSON.stringify(pkg.root.anchors)).digest('hex');
  return pkg;
}

/**
 * 由样例改造成「--key 全量 PASS」的 v3 包：2 条真实 HMAC 链行 + 仅 ai-audit 锚 + digest 自洽。
 * （2 行是为了让篡改用例能改「第 2 行」并断言定位。）
 */
function passFullPkg() {
  const pkg = JSON.parse(readFileSync(SAMPLE_V3, 'utf8'));
  const base = pkg.chains.aiAudit[0];
  const rows = [
    { seq: 1, id: base.id, prevHash: null, hash: '', payload: base.payload },
    { seq: 2, id: base.id + 1, prevHash: null, hash: '', payload: { userId: '42', action: 'tool_call', detail: 'create_followup_task({"customerId":7})' } },
  ];
  let prev = null;
  for (const r of rows) {
    r.prevHash = prev;
    r.hash = chainHash(KEY, prev, r.payload);
    prev = r.hash;
  }
  pkg.chains.aiAudit = rows;
  pkg.chains.operationAudit = [];
  pkg.root.anchors = [{ kind: 'ai-audit', rowId: rows[0].id, hash: rows[0].hash }];
  pkg.root.digest = createHash('sha256').update(JSON.stringify(pkg.root.anchors)).digest('hex');
  return pkg;
}

/** 临时目录内落一个包 + 跑脚本，返回 { status, stdout, html }。 */
function runCli(pkg, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'd2-report-'));
  try {
    const pkgPath = join(dir, 'pkg.json');
    const outPath = join(dir, 'report.html');
    writeFileSync(pkgPath, JSON.stringify(pkg));
    // cwd 设为临时目录：相对 --out 落在沙箱内（不污染仓库）
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'verify-evidence.mjs'), pkgPath, ...args], { encoding: 'utf8', cwd: dir });
    let html = null;
    try { html = readFileSync(outPath, 'utf8'); } catch { /* 未产出 */ }
    return { status: r.status, stdout: r.stdout ?? '', html };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('D-2 无外链：渲染件产出单文件自包含 HTML（零 http/script src/@import）', () => {
  const html = renderHtml(passStructurePkg(), { ok: true, mode: 'structure', rowsCount: 1 }, {});
  assert.equal(EXT_LINK_RE.test(html), false, '不应含任何外链');
  assert.match(html, /<style>/, 'CSS 应内联');
  assert.match(html, /^<!DOCTYPE html>/, '应为完整 HTML 文档');
});

test('D-2 缺失段：summary/replay 为空 → 显式标注「本包无此段」而非崩溃', () => {
  const html = renderHtml(passStructurePkg(), { ok: true, mode: 'structure', rowsCount: 1 }, {});
  assert.match(html, /本包无摘要/);
  assert.match(html, /Section absent|No summary/);
});

test('D-2 签名缺省：signature=null → 如实标注「无法验签」', () => {
  const html = renderHtml(passStructurePkg(), { ok: true, mode: 'structure', rowsCount: 1 }, {});
  assert.match(html, /无法验签|cannot be verified/);
});

test('D-2 i18n：默认中英并列，--lang zh 只出中文关键段', () => {
  const pkg = passStructurePkg();
  const both = renderHtml(pkg, { ok: true, mode: 'structure', rowsCount: 1 }, {});
  assert.match(both, /审计证据报告/);
  assert.match(both, /Audit Evidence Report/);
  const zh = renderHtml(pkg, { ok: true, mode: 'structure', rowsCount: 1 }, { lang: 'zh' });
  assert.match(zh, /审计证据报告/);
  assert.equal(/Audit Evidence Report/.test(zh), false, '--lang zh 不应含英文标题');
});

test('D-2 确定性：同输入两次渲染关键段一致（含头注释锚）', () => {
  const pkg = passStructurePkg();
  const a = renderHtml(pkg, { ok: true, mode: 'structure', rowsCount: 1 }, {});
  const b = renderHtml(pkg, { ok: true, mode: 'structure', rowsCount: 1 }, {});
  assert.equal(a, b);
  assert.match(a, /keelbase-report\/1 format=keelbase-audit-evidence\/3/);
});

test('D-2 CLI 结论：结构 PASS（digest 自洽）→ exit 0 + 报告含 PASS', () => {
  const { status, html, stdout } = runCli(passStructurePkg(), ['--format=html', '--out', 'report.html']);
  assert.equal(status, 0, stdout);
  assert.ok(html, '应产出 HTML');
  assert.match(html, /PASS/);
  assert.match(html, /报告：|report/i);
});

test('D-2 CLI 篡改定位：--key 下改一行 payload → FAIL 且报告含「行 2」', () => {
  const pkg = passFullPkg();
  pkg.chains.aiAudit[1].payload = { ...pkg.chains.aiAudit[1].payload, detail: 'TAMPERED' };
  const { status, html } = runCli(pkg, ['--key', KEY, '--format=html', '--out', 'report.html']);
  assert.equal(status, 1);
  assert.match(html, /FAIL/);
  assert.match(html, /行 2|row 2/);
});

test('D-2 CLI 向后兼容：不加 --format 时仍走 json（stdout 结论 + 不入 HTML）', () => {
  const { html, stdout } = runCli(passStructurePkg(), []);
  assert.equal(html, null, '默认不应产出 HTML');
  assert.match(stdout, /验证结论/);
});

test('D-2 无新依赖：渲染件只 import node: 内置', () => {
  const src = readFileSync(join(SCRIPTS, 'lib/evidence-report-html.mjs'), 'utf8');
  const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(imports.length === 0 || imports.every((i) => i.startsWith('node:')), `非内置依赖：${imports.join(', ')}`);
});

test('D-2 转义：escapeHtml 与 pair 拦截注入', () => {
  assert.equal(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.match(pair('<x>', '<y>', 'both'), /&lt;x&gt;/);
  assert.equal(/<x>/.test(pair('<x>', '<y>', 'both')), false);
});

test('D-2 CLI 参数：--format=html 与 --out=… 等号形亦可解析', () => {
  const { status, html } = runCli(passStructurePkg(), ['--format=html', '--out=report.html']);
  assert.equal(status, 0);
  assert.ok(html);
});
