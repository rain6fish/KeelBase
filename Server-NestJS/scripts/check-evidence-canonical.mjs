#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * 证据根整包 canonical 手写序防漂移闸（1.0.8 review-deferred 收敛）：
 *
 * keelbase-audit-evidence/3 的整包签名 = HMAC(key, canonical) 覆盖
 * action/authorization/decision/effect/chains/root/exportedAt(+summary/replay 存在才含)。
 * canonical 键序在导出侧（src/ai/audit/audit.service.ts getEvidenceRoot）与离线验证侧
 * （scripts/verify-evidence.mjs）各有一份手写序——因 verify-evidence.mjs 依设计独立于参考实现
 * （只 import Node 内置，供审计机构离线验证），两处无法共享同一运行时模块。
 *
 * 本闸以「导出侧与验证侧各自文本推导出的有效键序必须逐字节一致」把关：任一侧新增/换序
 * canonical 段而未同步另一侧 → 键序发散 → FAIL。漂移不再静默（已导出证据包会悄悄无法验证）。
 * 改动 canonical 键序属语义变更 → 走 C1 语义变更评审清单，两侧同步改并由本闸常绿背书。
 *
 * 用法：node scripts/check-evidence-canonical.mjs   （exit 0 = 两侧一致）
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const auditPath = resolve(ROOT, 'src/ai/audit/audit.service.ts');
const verifierPath = resolve(ROOT, 'scripts/verify-evidence.mjs');
const specPath = resolve(ROOT, 'src/ai/audit/evidence-root.service.spec.ts');

const bad = (msg) => { console.error(`  ✗ ${msg}`); };
const ok = (msg) => { console.log(`  ✓ ${msg}`); };

/** audit.service getEvidenceRoot：v3 canonical 对象字面量 + 条件尾段（summary/replay）推导有效键序 */
function keysFromAudit(src) {
  const marker = src.indexOf('// v3 canonical');
  if (marker < 0) throw new Error('audit.service.ts 未找到 v3 canonical 注释');
  const seg = src.slice(marker);
  const open = seg.indexOf('canonicalObj: Record<string, unknown> = {');
  if (open < 0) throw new Error('audit.service.ts 未找到 canonicalObj 字面量');
  const body = seg.slice(open + 'canonicalObj: Record<string, unknown> = {'.length, seg.indexOf('};', open));
  const keys = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*[(:,]/);
    if (m && !m[1].startsWith('canonicalObj')) keys.push(m[1]);
  }
  // 条件尾段（canonicalObj.summary = … / canonicalObj.replay = …）按**源码出现序**推导，
  // 而非硬编码列表——否则重排两行赋值时真实 canonical 串已变、此函数仍返回旧序 → 闸报假 PASS。
  const tailRe = /canonicalObj\.([A-Za-z_$][\w$]*)\s*=/g;
  let tail;
  while ((tail = tailRe.exec(seg)) !== null) keys.push(tail[1]);
  return keys;
}

/** verify-evidence.mjs v3 整包签名：JSON.stringify 字面量 + 条件 spread 推导有效键序 */
function keysFromVerifier(src) {
  const marker = src.indexOf('整包签名（v3 canonical');
  if (marker < 0) throw new Error('verify-evidence.mjs 未找到 v3 整包签名段');
  const seg = src.slice(marker);
  const open = seg.indexOf('JSON.stringify({');
  if (open < 0) throw new Error('verify-evidence.mjs v3 段未找到 JSON.stringify({');
  const body = seg.slice(open + 'JSON.stringify({'.length, seg.indexOf('});', open));
  const keys = [];
  for (const line of body.split('\n')) {
    const direct = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (direct) { keys.push(direct[1]); continue; }
    const spread = line.match(/\.\.\.\(ev\.(\w+)\s*\?/);
    if (spread) keys.push(spread[1]);
  }
  return keys;
}

/** evidence-root.service.spec.ts 签名自证段：JSON.stringify 字面量 + 条件 spread（out. 前缀）推导有效键序 */
function keysFromSpec(src) {
  const marker = src.indexOf('v3 canonical 可复现');
  if (marker < 0) throw new Error('evidence-root.service.spec.ts 未找到 v3 canonical 签名段');
  const seg = src.slice(marker);
  const open = seg.indexOf('JSON.stringify({');
  if (open < 0) throw new Error('evidence-root.service.spec.ts 未找到 JSON.stringify({');
  const body = seg.slice(open + 'JSON.stringify({'.length, seg.indexOf('});', open));
  const keys = [];
  for (const line of body.split('\n')) {
    const direct = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (direct) { keys.push(direct[1]); continue; }
    const spread = line.match(/\.\.\.\(out\.(\w+)\s*\?/);
    if (spread) keys.push(spread[1]);
  }
  return keys;
}

let auditKeys;
let verifierKeys;
let specKeys;
try {
  auditKeys = keysFromAudit(readFileSync(auditPath, 'utf8'));
  verifierKeys = keysFromVerifier(readFileSync(verifierPath, 'utf8'));
  specKeys = keysFromSpec(readFileSync(specPath, 'utf8'));
} catch (err) {
  bad(`无法解析 canonical 键序（fail-loud）：${err.message}`);
  process.exit(1);
}

const sites = [
  ['导出侧（audit.service.ts）', auditKeys],
  ['离线验证侧（verify-evidence.mjs）', verifierKeys],
  ['签名自证（evidence-root.service.spec.ts）', specKeys],
];
const ref = auditKeys;
const pass = ref.length > 0
  && sites.every(([, k]) => k.length === ref.length && k.every((x, i) => x === ref[i]));

if (pass) {
  ok(`证据根 v3 canonical 键序三处一致（${ref.join(' → ')}）`);
} else {
  bad('证据根 v3 canonical 键序发散：三处（导出 / 离线验证 / 签名自证）未同键同序');
  for (const [label, k] of sites) console.error(`  ${label}: [${k.join(', ')}]`);
  console.error('  修复：三处 canonical 保持同键同序（走 C1 语义变更清单）；或导出后先离线验证再发布。');
  process.exit(1);
}
