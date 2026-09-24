#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * D-1 期间审计报告 CLI（docs/period-audit-report.spec.md）：把 `ActionReportExport`
 * （keelbase-audit-evidence/1|2，GET /audit/action-report/export 产物）渲染成**单文件自包含 HTML**。
 *
 * 「七问」：谁 / 何时 / 做了什么 / 为什么 / 凭什么被允许 / 结果 / 可否独立验证——
 * 逐条动作索引**链接**到各单动作 D-2 报告（`verify-evidence.mjs --format=html` 产物）。
 *
 * 审阅侧工具：由**被验物**产出报告，服务端不进可信链（spec §6）。不新增端点/表/链。
 *
 * 用法：node scripts/render-period-report.mjs <export.json> [--key <AUDIT_HMAC_KEY[,PREVIOUS...]>] [--lang zh|en] [--out <file>]
 * 输出：单文件 HTML；stdout 结论；退出码 PASS?0:1
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { parseArgs, keysFromFlags, langFromFlags } from './lib/cli-args.mjs';
import { verifyPeriodPackage, renderPeriodHtml } from './lib/period-report-html.mjs';
// The algorithm single source is the contract's; this CLI supplies it to the renderer.
// 算法单源是契约的；由这个 CLI 交给渲染件。
import { chainHash } from '../specs/protocol/runner/lib/protocol-algorithms.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const fileArg = positional[0];
const keys = keysFromFlags(flags);
const lang = langFromFlags(flags);
const outOpt = typeof flags.out === 'string' && flags.out ? flags.out : null;
const limit = Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : 50;

if (!fileArg) {
  console.error('用法：node scripts/render-period-report.mjs <export.json> [--key <AUDIT_HMAC_KEY[,PREVIOUS...]>] [--lang zh|en] [--out <file>]');
  process.exit(1);
}

let pkg;
try { pkg = JSON.parse(readFileSync(fileArg, 'utf8')); }
catch (e) { console.error(`✗ 无法读取导出 JSON：${e.message}`); process.exit(1); }

if (!/^keelbase-audit-evidence\/[12]$/.test(pkg.format ?? '')) {
  console.error(`✗ 本工具处理**期间**导出（keelbase-audit-evidence/1|2）；实得 ${pkg.format ?? '(缺失)'}。`);
  console.error('  单动作证据根（/3）请用：node scripts/verify-evidence.mjs <pkg.json> --format=html');
  process.exit(1);
}

const verdict = verifyPeriodPackage(pkg, keys, chainHash);
const html = renderPeriodHtml(pkg, verdict, { lang, pkgName: basename(fileArg), limit });
const outPath = outOpt ?? resolve(dirname(fileArg), `${basename(fileArg).replace(/\.[^.]+$/, '')}.report.html`);
writeFileSync(outPath, html);

console.log('═══ 期间审计报告（D-1，离线自包含）═══');
console.log(`结论：${verdict.ok ? 'PASS' : 'FAIL'}（模式：${verdict.mode === 'full' ? '全量重算 + 验签' : '结构验证（未提供 --key）'}）`);
if (verdict.brokenAt) console.log(`断链 @ 行 ${verdict.brokenAt}`);
if (verdict.recomputed) console.log(`链行重算：${verdict.recomputed.done}/${verdict.recomputed.total} 一致`);
switch (verdict.signatureState) {
  case 'absent': console.log('签名：本包无签名（导出时未配密钥）——无法验签'); break;
  case 'skipped': console.log('签名：本包含签名但未提供 --key，未验签'); break;
  case 'verified': console.log('签名：验证通过'); break;
  default: console.log('签名：不匹配（导出后被改动或密钥不符）'); break;
}
console.log(`报告：${outPath}`);
process.exit(verdict.ok ? 0 : 1);
