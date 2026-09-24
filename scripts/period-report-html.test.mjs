// SPDX-License-Identifier: Apache-2.0

/**
 * D-1 期间审计报告测试（docs/period-audit-report.spec.md §7）。
 * 覆盖：无外链（放行相对 .html 链接）/ 七问段齐 / 结论正确（PASS·FAIL·篡改定位·签名三态）/
 * 样本诚实「明细样本 N / 总数 M」/ 逐条链接与缺失降级 / i18n 中英并列 / 确定性 / 无新依赖 / 拒绝 /3。
 * 运行：node --test scripts/*.test.mjs（npm run cli:test，CI cli-test job）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderPeriodHtml, verifyPeriodPackage } from '../Server-NestJS/scripts/lib/period-report-html.mjs';
import { chainHash } from '../Server-NestJS/specs/protocol/runner/lib/protocol-algorithms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = resolve(__dirname, '../Server-NestJS/scripts');
const SAMPLE_V2 = resolve(__dirname, '../Server-NestJS/specs/protocol/schemas/v2/samples/action-report-export.json');
const SAMPLE_V3 = resolve(__dirname, '../Server-NestJS/specs/protocol/schemas/v2/samples/evidence-package.json');
const KEY = 'test-period-hmac-key-0123456789';
const EXT_LINK_RE = /https?:\/\/|<script\s+src|@import\s+url\(/;

/** 用真实 HMAC 重签链 + 整包签名（与导出实现同构：普通 JSON.stringify 键序）。 */
function signedPkg({ tamper = false } = {}) {
  const pkg = JSON.parse(readFileSync(SAMPLE_V2, 'utf8'));
  let prev = null;
  for (const r of pkg.chain) { r.prevHash = prev; r.hash = chainHash(KEY, prev, r.payload); prev = r.hash; }
  pkg.report.hashChain = { valid: true, checked: pkg.chain.length, brokenIndex: null };
  const canonical = JSON.stringify({
    summary: pkg.report?.summary,
    hashChain: pkg.report?.hashChain,
    effectDiffs: pkg.report?.effectDiffs,
    ...(pkg.format === 'keelbase-audit-evidence/2' ? { compliance: pkg.compliance } : {}),
    chain: pkg.chain,
    exportedAt: pkg.exportedAt,
  });
  pkg.signature = createHmac('sha256', KEY).update(canonical).digest('hex');
  if (tamper) pkg.chain[1].payload = { ...pkg.chain[1].payload, detail: 'TAMPERED' };
  return pkg;
}

function render(pkg, keys = [], opts = {}) {
  return renderPeriodHtml(pkg, verifyPeriodPackage(pkg, keys, chainHash), { pkgName: 'export.json', ...opts });
}

/** 临时目录内落包 + 跑 D-1 CLI；返回 { status, stdout, html }。 */
function runCli(pkg, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'd1-report-'));
  try {
    const pkgPath = join(dir, 'export.json');
    writeFileSync(pkgPath, JSON.stringify(pkg));
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'render-period-report.mjs'), pkgPath, ...args], { encoding: 'utf8', cwd: dir });
    let html = null;
    try { html = readFileSync(join(dir, 'report.html'), 'utf8'); } catch { /* 未产出 */ }
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', html };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('D-1 无外链：单文件自包含（相对 .html 链接为唯一例外）', () => {
  const html = render(signedPkg());
  assert.equal(EXT_LINK_RE.test(html), false, '不应含任何外链');
  assert.match(html, /href="\.\/90211\.report\.html"/, '逐条链接应为同目录相对路径');
  assert.match(html, /<style>/);
});

test('D-1 七问段齐：结论/封面/期间摘要/动作构成/逐条索引/链行清单/验证步骤/诚实边界', () => {
  const html = render(signedPkg());
  for (const s of ['期间审计报告', '期间摘要', '动作构成', '逐条动作索引', '链行清单', '验证步骤', '诚实边界']) {
    assert.match(html, new RegExp(s), `缺段：${s}`);
  }
});

test('D-1 样本诚实：显式打印「明细样本 N / 总数 M」（明细非全量）', () => {
  const html = render(signedPkg());
  assert.match(html, /明细样本 1（上限 50）\/ 总数 2/);
  assert.match(html, /Detail is a sample|明细为样本/);
});

test('D-1 逐条链接缺失降级：href 为空时显示「未附」且本报告仍可读', () => {
  const html = render(signedPkg(), [], { actionReportHref: () => null });
  assert.match(html, /未附|Not attached/);
  assert.match(html, /期间摘要/, '本报告自身仍应完整可读');
  assert.equal(/href="\.\/90211/.test(html), false, '不应再出相对链接');
});

test('D-1 结论：无密钥 → 结构验证（取包内 hashChain.valid）；签名缺省如实标注', () => {
  const pkg = signedPkg();
  const v = verifyPeriodPackage(pkg, [], chainHash);
  assert.equal(v.ok, true);
  assert.equal(v.mode, 'structure');
  assert.equal(v.signatureState, 'skipped', '有签名但无密钥 → 未验签');
  const html = render(pkg, []);
  assert.match(html, /未提供 --key，未验签|no --key was provided/);
});

test('D-1 结论：--key 正确 → 全量重算 + 验签 PASS', () => {
  const pkg = signedPkg();
  const v = verifyPeriodPackage(pkg, [KEY], chainHash);
  assert.equal(v.mode, 'full');
  assert.equal(v.signatureState, 'verified');
  assert.deepEqual(v.recomputed, { done: 2, total: 2 });
  assert.equal(v.ok, true);
});

test('D-1 篡改定位：--key 下改一行 payload → FAIL 且含「断链 @ 行 2」', () => {
  const v = verifyPeriodPackage(signedPkg({ tamper: true }), [KEY], chainHash);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 2);
  const html = renderPeriodHtml(signedPkg({ tamper: true }), v, { pkgName: 'export.json' });
  assert.match(html, /FAIL/);
  assert.match(html, /行 2|row 2/);
});

test('D-1 签名不匹配：错密钥 → FAIL（signature mismatch）', () => {
  const v = verifyPeriodPackage(signedPkg(), ['wrong-key'], chainHash);
  assert.equal(v.signatureState, 'mismatch');
  assert.equal(v.ok, false);
  assert.match(renderPeriodHtml(signedPkg(), v, {}), /签名不匹配|Signature mismatch/);
});

test('D-1 签名缺省：signature=null → signatureState=absent 且如实标注无法验签', () => {
  const pkg = JSON.parse(readFileSync(SAMPLE_V2, 'utf8'));
  const v = verifyPeriodPackage(pkg, [KEY], chainHash);
  assert.equal(v.signatureState, 'absent');
  assert.match(renderPeriodHtml(pkg, v, {}), /无签名.*无法验签|cannot be verified/);
});

test('D-1 i18n：默认中英并列；--lang zh 无英文标题', () => {
  const both = render(signedPkg());
  assert.match(both, /期间审计报告/);
  assert.match(both, /Period Audit Report/);
  const zh = render(signedPkg(), [], { lang: 'zh' });
  assert.match(zh, /期间审计报告/);
  assert.equal(/Period Audit Report/.test(zh), false);
});

test('D-1 确定性：同输入两次渲染一致（含头注释锚）', () => {
  const pkg = signedPkg();
  const a = render(pkg);
  const b = render(pkg);
  assert.equal(a, b);
  assert.match(a, /keelbase-report\/1 format=keelbase-audit-evidence\/2 .*mode=structure/);
});

test('D-1 CLI：--key 正确 → exit 0 + 产出 HTML；无 --key → 结构验证', () => {
  const ok = runCli(signedPkg(), ['--key', KEY, '--out', 'report.html']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(ok.html);
  assert.match(ok.stdout, /PASS/);

  const struct = runCli(signedPkg(), ['--out', 'report.html']);
  assert.equal(struct.status, 0);
  assert.match(struct.stdout, /结构验证/);
});

test('D-1 CLI 篡改：--key 下 exit 1 且 stdout 报断链行', () => {
  const r = runCli(signedPkg({ tamper: true }), ['--key', KEY, '--out', 'report.html']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /断链 @ 行 2/);
});

test('D-1 CLI 拒绝 /3：提示改用 verify-evidence.mjs --format=html', () => {
  const r = runCli(JSON.parse(readFileSync(SAMPLE_V3, 'utf8')), []);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verify-evidence\.mjs.*--format=html/);
});

test('D-1 消费 D-3 决策说明：动作索引「为什么」优先渲染 decisionNote 句', () => {
  const html = render(signedPkg());
  assert.match(html, /允许：范围=user_scoped/, '应渲染 decisionNote.sentence（凭什么允许）');
});

test('D-1 无新依赖：渲染件只 import node: 内置或同目录相对件', () => {
  const src = readFileSync(join(SCRIPTS, 'lib/period-report-html.mjs'), 'utf8');
  const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(imports.every((i) => i.startsWith('node:') || i.startsWith('./')), `非法依赖：${imports.join(', ')}`);
});
