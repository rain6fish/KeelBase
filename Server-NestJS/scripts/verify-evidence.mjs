#!/usr/bin/env node
/**
 * A2 审计证据包离线机器验证（护城河 2.3）：审计机构/第三方不装 KeelBase 即可独立验证证据包。
 *
 * 输入：GET /audit/action-report/export 导出的证据包 JSON（format = 'keelbase-audit-evidence/1'）。
 *
 * 两种模式：
 *   - 无 --key：链结构验证（seq 升序 / hash 64 hex / prevHash 连续 / 首行 genesis）——
 *     能检测删行、换序、断链。
 *   - --key <AUDIT_HMAC_KEY[,PREVIOUS...]>：全量重算每条 payload 的 hash（canonicalJSON + HMAC，
 *     对齐协议 §2.2/§2.3）+ 证据包签名验证——能检测内容篡改，证明导出后未被改动。
 *
 * 只 import Node 内置（crypto/fs/path），独立实现协议算法，与参考实现无关。
 *
 * 用法：node scripts/verify-evidence.mjs <evidence.json> [--key <key>]
 * 输出：stdout 报告；docs/benchmark/evidence-verify-<ts>.json + .md
 */
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [,, fileArg, keyFlag, keyValue] = process.argv;
const keys = keyFlag === '--key' ? String(keyValue ?? '').split(',').filter(Boolean) : [];

if (!fileArg) {
  console.error('用法：node scripts/verify-evidence.mjs <evidence.json> [--key <AUDIT_HMAC_KEY[,PREVIOUS...]>]');
  process.exit(1);
}

/** canonicalJSON：顶层键排序 + undefined 剔除 + null 保留（协议 §2.3）。 */
function canonicalJSON(payload) {
  const keys = Object.keys(payload).filter((k) => payload[k] !== undefined).sort();
  return JSON.stringify(payload, keys);
}

/** 链 hash：HMAC(key, `${prevHash ?? 'genesis'}|${canonical}`)（协议 §2.2）。 */
function chainHash(key, prevHash, payload) {
  return createHmac('sha256', key).update(`${prevHash ?? 'genesis'}|${canonicalJSON(payload)}`).digest('hex');
}

const startMs = Date.now();
const cases = [];
const ok = (name, detail = '') => { cases.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { cases.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

let ev;
try { ev = JSON.parse(readFileSync(fileArg, 'utf8')); }
catch (e) { console.error(`✗ 无法读取证据包 JSON：${e.message}`); process.exit(1); }

console.log('═══ A2 审计证据包离线验证（不依赖 KeelBase）═══\n');
console.log(`证据包：${fileArg}`);

// 0. 格式
if (ev.format === 'keelbase-audit-evidence/1') ok('格式版本（keelbase-audit-evidence/1）', ev.format);
else bad('格式版本', ev.format ?? '(缺失)');

const rows = ev.chain ?? [];
if (rows.length > 0) ok('链行数', `${rows.length} 条（seq ${rows[0]?.seq}–${rows[rows.length - 1]?.seq}）`);
else bad('链行数', '空链');

// 1. 结构验证（无需密钥）
let structural = true;
if (rows.some((r, i) => r.seq !== i + 1)) { structural = false; bad('seq 沿 id 升序（1 起连续）', 'seq 断裂'); }
if (rows.some((r) => !/^[0-9a-f]{64}$/.test(r.hash ?? ''))) { structural = false; bad('每条 hash 为 64 hex', '含非法 hash'); }
for (let i = 1; i < rows.length; i++) {
  if (rows[i].prevHash !== rows[i - 1].hash) { structural = false; bad('prevHash 连续', `断链@${rows[i].seq}：${rows[i].prevHash?.slice(0, 12) ?? 'null'} ≠ ${rows[i - 1].hash?.slice(0, 12)}`); break; }
}
if (structural) ok('链结构：seq 连续 + hash 64 hex + prevHash 连续', '可检测删行/换序/断链');
if (rows.length && rows[0].prevHash != null) bad('首行 genesis（prevHash 为 null）', `实得 ${rows[0].prevHash}`);

// 2. 全量重算（--key）
let recompute = 0;
if (keys.length === 0) {
  console.log('\n  — 未提供 --key，跳过内容重算（链结构已验证）。加 --key <AUDIT_HMAC_KEY> 全量重算内容。');
} else {
  let mismatchAt = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const matched = keys.some((k) => chainHash(k, r.prevHash, r.payload) === r.hash);
    if (!matched) { mismatchAt = r.seq; break; }
    recompute++;
  }
  if (mismatchAt < 0) ok(`内容重算（--key）：${rows.length} 条 payload 重算全部匹配`, `密钥数=${keys.length}`);
  else bad('内容重算（--key）', `seq ${mismatchAt} 重算不匹配（内容被篡改或密钥不符）`);

  // 3. 证据包签名验证
  if (ev.signature) {
    const canonical = JSON.stringify({
      summary: ev.report?.summary,
      hashChain: ev.report?.hashChain,
      effectDiffs: ev.report?.effectDiffs,
      chain: ev.chain,
      exportedAt: ev.exportedAt,
    });
    const sigOk = keys.some((k) => createHmac('sha256', k).update(canonical).digest('hex') === ev.signature);
    sigOk ? ok('证据包签名（HMAC-SHA256 覆盖 summary+hashChain+effectDiffs+chain+exportedAt）', '导出后未被改动') : bad('证据包签名', '签名不匹配（导出后被改动或密钥不符）');
  } else {
    console.log('  — 证据包无 signature（导出时未配 AUDIT_HMAC_KEY/ENCRYPTION_KEY）。');
  }
}

// 结论
const passCount = cases.filter((c) => c.pass).length;
const chainValid = structural && (keys.length === 0 || recompute === rows.length) && (!rows.length || rows[0].prevHash == null);
const signatureOk = keys.length === 0 || ev.signature == null || cases.some((c) => c.name.includes('证据包签名') && c.pass);
const verdict = chainValid && (signatureOk || keys.length === 0) ? 'PASS' : 'FAIL';
console.log(`\n═══ 验证结论：${verdict}（${passCount}/${cases.length} 断言通过）═══`);
console.log(chainValid
  ? '链完整：结构连续' + (keys.length ? ` + ${recompute}/${rows.length} 内容重算一致` : '（未做内容重算）')
  : '链不完整：存在断链/篡改');

// 报告
const elapsed = Date.now() - startMs;
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const report = {
  gate: 'A2 审计证据包离线验证（护城河 2.3）',
  source: fileArg,
  format: ev.format,
  mode: keys.length ? 'full (structure + content recompute + signature)' : 'structure-only',
  verdict,
  rows: rows.length,
  recomputed: recompute,
  exportedAt: ev.exportedAt,
  cases,
  elapsedSec: Math.round(elapsed / 1000),
};
mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
const base = resolve(__dirname, `../docs/benchmark/evidence-verify-${ts}`);
writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
const md = [
  `# A2 审计证据包离线验证（${ts}）`, '',
  `- **${verdict}** ｜ ${rows.length} 条链 ｜ 模式：${report.mode} ｜ 导出时间 ${ev.exportedAt}`, '',
  '| # | 断言 | 结果 | 详情 |', '|---|------|------|------|',
  ...cases.map((c, i) => `| ${i + 1} | ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`), '',
].join('\n');
writeFileSync(`${base}.md`, md);
console.log(`报告：docs/benchmark/evidence-verify-${ts}.md`);
process.exit(verdict === 'PASS' ? 0 : 1);
