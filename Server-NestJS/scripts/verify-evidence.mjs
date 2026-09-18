#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * A2 审计证据包离线机器验证（证据分层 L1 离线复核）：审计机构/第三方不装 KeelBase 即可独立验证证据包。
 *
 * 输入：
 *   - keelbase-audit-evidence/1、/2：GET /audit/action-report/export 导出（单链全量，report+compliance+chain）。
 *   - keelbase-audit-evidence/3（① 证据根 AUDIT-ID）：GET /ai/governance/evidence-root/:resultType/:resultId 导出——
 *     单条业务动作跨链证据根（chains.aiAudit + chains.operationAudit 子链行 + side-effect 锚 + root 根锚）。
 *
 * 两种模式：
 *   - 无 --key：结构验证（/1 /2：seq 连续 / hash 64hex / prevHash 连续 / 首行 genesis；/3：action/effect 存在、
 *     anchors hash 64hex、root.digest 可复现自洽）。
 *   - --key <AUDIT_HMAC_KEY[,PREVIOUS...]>：全量重算每条 payload 的 hash（canonicalJSON + HMAC，
 *     对齐协议 §2.2/§2.3）+ 根锚 digest + 证据包签名验证。
 *
 * 签名段（docs/evidence-root.spec.md §11）按形态分派，三种都认：
 *   - null：导出时未配任何密钥；
 *   - 字符串：历史 /1 /2 /3 包，按 HMAC 验（向后兼容）；
 *   - 对象 {hmac, sm2?}：HMAC 分支（需 --key）+ SM2 分支（需 --sm2-pubkey）各自独立断言。
 *   `--sm2-pubkey <hex|pem>` 用**验证方自持的公钥**做国密 SM2 验签（SM2-with-SM3）——这是「第三方持公钥
 *   离线独立验签」的落点；canonical 不含 signature 段自身，故**不**依赖包内 publicKey（仅作展示与一致性比对）。
 *   无 `--sm2-pubkey`：只做结构校验并明确标注「未验签」。**无国密库（宿主无 openssl）时明报「需国密库」
 *   并不判 PASS**——绝不静默降级（§11.2 硬要求）。
 *
 * 只 import Node 内置（crypto/fs/path/child_process/os），独立实现协议算法，与参考实现无关；
 * SM2 经宿主 openssl CLI 完成，**不引第三方国密库**。
 *
 * 用法：node scripts/verify-evidence.mjs <evidence.json> [--key <key>] [--sm2-pubkey <hex|pem>] [--format=json|html] [--lang zh|en] [--out <file>]
 * 输出：stdout 报告；docs/benchmark/evidence-verify-<ts>.json + .md（默认 json）。
 *   --format=html：由证据包生成**单文件自包含 HTML 报告**（交付物层 D-2，docs/evidence-report.spec.md）——
 *   渲染件复用 scripts/lib/evidence-report-html.mjs；默认 json 行为不变。
 */
import { createHmac, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderHtml } from './lib/evidence-report-html.mjs';
import { parseArgs, keysFromFlags, langFromFlags } from './lib/cli-args.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { positional, flags } = parseArgs(process.argv.slice(2));
const fileArg = positional[0];
const keys = keysFromFlags(flags);
const formatOpt = flags.format === 'html' ? 'html' : 'json'; // 默认 json（与现状一致）
const langOpt = langFromFlags(flags);
const outOpt = typeof flags.out === 'string' && flags.out ? flags.out : null;
/** §11.2：第三方持公钥独立验签（不依赖应用内共享密钥）——hex 点或 PEM。 */
const sm2PubkeyOpt = typeof flags['sm2-pubkey'] === 'string' && flags['sm2-pubkey'] ? flags['sm2-pubkey'] : null;
/** §11.3：可选定期根锚文件——校验「本包在该日锚覆盖范围内」+ 锚自洽。 */
const anchorOpt = typeof flags.anchor === 'string' && flags.anchor ? flags.anchor : null;

if (!fileArg) {
  console.error('用法：node scripts/verify-evidence.mjs <evidence.json> [--key <AUDIT_HMAC_KEY[,PREVIOUS...]>] [--sm2-pubkey <hex|pem>] [--anchor <anchor.json>] [--format=json|html] [--lang zh|en] [--out <file>]');
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

// ──────────────── §11 SM2 国密验签（委托宿主 openssl；本脚本保持无第三方依赖）────────────────
/** SM2 公钥 SPKI DER 前缀（26 字节）：id-ecPublicKey + SM2 OID 1.2.156.10197.1.301。 */
const SM2_SPKI_PREFIX = '3059301306072a8648ce3d020106082a811ccf5501822d034200';
const SM2_DEFAULT_USER_ID = '1234567812345678';

/** 结构合规判据（§11.2）：字段存在 + 格式合法；**不做密码学验签**。 */
function sm2StructureIssues(sm2) {
  const issues = [];
  if (sm2.alg !== 'SM2-with-SM3') issues.push(`alg 必须为 SM2-with-SM3（实得 ${JSON.stringify(sm2.alg)}）`);
  if (sm2.encoding !== 'raw' && sm2.encoding !== 'der') issues.push(`encoding 必须为 raw|der（实得 ${JSON.stringify(sm2.encoding)}）`);
  if (typeof sm2.userId !== 'string') issues.push('userId 必须为字符串（如实标注实际所用区分标识）');
  if (typeof sm2.publicKey !== 'string' || !/^(04[0-9a-f]{128}|0[23][0-9a-f]{64})$/.test(sm2.publicKey)) {
    issues.push('publicKey 必须为 04||x||y（130 hex）或 02/03||x（66 hex）');
  }
  const expectLen = sm2.encoding === 'raw' ? 128 : null;
  if (typeof sm2.value !== 'string' || !/^[0-9a-f]+$/.test(sm2.value)) issues.push('value 必须为 hex');
  else if (expectLen && sm2.value.length !== expectLen) issues.push(`encoding=raw 时 value 须为 ${expectLen} hex（实得 ${sm2.value.length}）`);
  return issues;
}

/** raw（r||s 各 32 字节）→ DER；已 DER 则原样返回。 */
function sm2SigToDer(valueHex, encoding) {
  const raw = Buffer.from(valueHex, 'hex');
  if (encoding === 'der') return raw;
  if (raw.length !== 64) throw new Error(`raw 签名须 64 字节（r||s），实得 ${raw.length}`);
  const enc = (v) => {
    let x = v;
    while (x.length > 1 && x[0] === 0) x = x.subarray(1);
    if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]);
    return Buffer.concat([Buffer.from([0x02, x.length]), x]);
  };
  const body = Buffer.concat([enc(raw.subarray(0, 32)), enc(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

/**
 * 用 `--sm2-pubkey` 指定的公钥验签（§11.2）。
 * 返回 { ok, error }：ok=false + error=null 表示**验签不通过**；error 非空表示**环境/入参不可用**
 * （缺 openssl、公钥格式错）——两者严格区分，后者绝不降级为 PASS（执行包 §6.4）。
 */
function sm2Verify(canonical, pubkeyArg, sm2) {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'kb-verify-'));
    const pubPath = join(dir, 'pub.pem');
    const sigPath = join(dir, 'sig.der');
    const keyform = writePubkey(pubkeyArg, pubPath);
    writeFileSync(sigPath, sm2SigToDer(sm2.value, sm2.encoding));
    const out = execFileSync(
      'openssl',
      ['dgst', '-sm3', '-verify', pubPath, '-keyform', keyform, '-signature', sigPath, '-sigopt', `distid:${sm2.userId}`],
      { input: Buffer.from(canonical, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { ok: out.toString().includes('Verified OK'), error: null };
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { ok: false, error: '需国密库：未找到 openssl（SM2 验签需宿主 openssl 1.1.1+；本脚本不引第三方依赖，故不降级为 PASS）' };
    }
    if (typeof err?.status === 'number') return { ok: false, error: null }; // openssl 报验签不通过（exit 1）
    return { ok: false, error: `openssl 调用失败：${err?.stderr?.toString().trim() || err?.message || err}` };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

/** 公钥入参（hex 点 / PEM 内容 / PEM 文件路径）→ 写入临时文件，返回 openssl `-keyform`。 */
function writePubkey(arg, pubPath) {
  if (arg.includes('-----BEGIN')) {
    writeFileSync(pubPath, arg);
    return 'PEM';
  }
  if (/^(04[0-9a-fA-F]{128}|0[23][0-9a-fA-F]{64})$/.test(arg)) {
    const hex = arg.toLowerCase();
    if (hex.startsWith('04')) {
      writeFileSync(pubPath, Buffer.from(SM2_SPKI_PREFIX + hex, 'hex'));
      return 'DER';
    }
    throw new Error('压缩公钥需先解压为 04||x||y 未压缩点再验签');
  }
  // 兜底：当作 PEM 文件路径（由调用方保证存在）
  writeFileSync(pubPath, readFileSync(arg));
  return 'PEM';
}

/** 打印可复制的验签命令（无 --sm2-pubkey 时的「未验签」提示，§11.2）。 */
function sm2CopyCommand(sm2) {
  return [
    `      node scripts/verify-evidence.mjs ${fileArg} --sm2-pubkey <你的公钥 hex 或 .pem>`,
    `      # 等价 openssl：openssl dgst -sm3 -verify pub.pem -signature <签名.der> -sigopt distid:${sm2.userId} <canonical 字节>`,
  ].join('\n');
}

/**
 * §11.3 根锚校验：本包是否落在该日锚的覆盖范围内 + 锚自身是否自洽（+ 锚的 SM2 签名，需 --sm2-pubkey）。
 * 返回 true = 校验失败。锚的发布渠道在 KeelBase 信任域之外——本函数只做**接收侧的独立复核**。
 */
function checkAnchorFile(anchorPath, ev) {
  let anchor;
  try {
    anchor = JSON.parse(readFileSync(anchorPath, 'utf8'));
  } catch (e) {
    bad('根锚可读', `无法解析 ${anchorPath}：${e.message}`);
    return true;
  }
  const digest = ev.root?.digest;
  const digests = Array.isArray(anchor.digests) ? anchor.digests : [];
  const inAnchor = typeof digest === 'string' && digests.includes(digest);
  inAnchor
    ? ok('本包 root.digest 在该日锚的覆盖范围内', `date=${anchor.date} count=${anchor.count}`)
    : bad('本包 root.digest 在该日锚的覆盖范围内', digest ? `${String(digest).slice(0, 16)}… 不在锚集合中` : '本包缺 root.digest');

  const expected = createHash('sha256').update(JSON.stringify([...new Set(digests)].sort())).digest('hex');
  const aggOk = expected === anchor.rootDigest;
  aggOk
    ? ok('锚 rootDigest 与 digests 聚合一致（本地复现 sha256(JSON.stringify(sorted))）')
    : bad('锚 rootDigest 与 digests 聚合一致', `期望 ${expected.slice(0, 16)}… 实得 ${String(anchor.rootDigest).slice(0, 16)}…`);

  if (anchor.sm2 && sm2PubkeyOpt) {
    const r = sm2Verify(String(anchor.rootDigest), sm2PubkeyOpt, anchor.sm2);
    if (r.error) {
      bad('锚 SM2 验签', r.error);
      return true;
    }
    r.ok ? ok('锚 SM2 验签（rootDigest 的国密签名）') : bad('锚 SM2 验签', '验签不通过（rootDigest 被改 / 公钥或 userId 不符）');
    return !inAnchor || !aggOk || !r.ok;
  }
  if (anchor.sm2) console.log('  — 未提供 --sm2-pubkey：锚的 SM2 签名未验（仅做覆盖范围与聚合自洽）。');
  return !inAnchor || !aggOk;
}

/**
 * 签名段形态分派与校验（§11.4 向后兼容 + §11.2 SM2）。
 * 形态：null（未配密钥）/ 字符串（历史包 = HMAC）/ 对象 {hmac, sm2?}（双签）。
 * 返回 true = 出现「签名校验失败」或「要求验签却不可用」——调用方据此置 FAIL（绝不静默 PASS）。
 *
 * 安全要点：SM2 的 canonical **不含 signature 段自身**（§11.2 防自签自引用），故包内 `publicKey`
 * 也在 canonical 之外、可被替换。因此验签**必须**用 `--sm2-pubkey` 由验证方独立提供信任公钥；
 * 包内 publicKey 仅作展示与追溯（两者都给出且不一致时，作为独立断言报出）。
 */
function checkSignatureBlock(sig, canonical, label) {
  if (sig == null) {
    console.log(`  — ${label}无 signature（导出时未配 AUDIT_HMAC_KEY/ENCRYPTION_KEY，亦未配 SM2_PRIVATE_KEY）。`);
    return false;
  }

  // 历史形态：字符串 = HMAC（v1/v2/v3 旧包）
  if (typeof sig === 'string') {
    if (keys.length === 0) {
      console.log('  — 未提供 --key，跳过历史字符串签名校验（该形态即 HMAC）。');
      return false;
    }
    const okH = keys.some((k) => createHmac('sha256', k).update(canonical).digest('hex') === sig);
    okH
      ? ok(`${label}签名（HMAC-SHA256 历史字符串形态）`, '导出后未被改动')
      : bad(`${label}签名`, '签名不匹配（导出后被改动或密钥不符）');
    return !okH;
  }

  if (typeof sig !== 'object') {
    bad(`${label}签名段结构`, `形态非法（${typeof sig}）`);
    return true;
  }

  let failed = false;

  // ── HMAC 分支（应用内快验）
  if (!('hmac' in sig)) {
    bad(`${label}签名段结构`, '对象形态缺 hmac 字段');
    failed = true;
  } else if (sig.hmac === null) {
    console.log(`  — ${label}signature.hmac 为 null（导出时未配对称密钥）。`);
  } else if (keys.length === 0) {
    console.log('  — 未提供 --key，跳过 HMAC 分支校验（不影响 SM2 分支）。');
  } else {
    const okH = keys.some((k) => createHmac('sha256', k).update(canonical).digest('hex') === sig.hmac);
    okH ? ok(`${label}签名 HMAC 分支（HMAC-SHA256）`, '应用内对称验通过') : bad(`${label}签名 HMAC 分支`, '签名不匹配');
    if (!okH) failed = true;
  }

  // ── SM2 分支（第三方独立验签）
  const sm2 = sig.sm2;
  if (sm2 == null) {
    console.log(`  — ${label}无 signature.sm2（未配 SM2_PRIVATE_KEY）：本包仅对称可验。`);
    return failed;
  }
  const issues = sm2StructureIssues(sm2);
  if (issues.length) {
    bad(`${label}signature.sm2 结构合规`, issues.join('；'));
    return true;
  }
  ok(`${label}signature.sm2 结构合规`, `alg=${sm2.alg} encoding=${sm2.encoding} userId=${sm2.userId} keyId=${sm2.keyId ?? '—'}`);

  if (!sm2PubkeyOpt) {
    console.log('  — 未提供 --sm2-pubkey：SM2 **仅做结构校验、未验签**（§11.2）。第三方验签：');
    console.log(sm2CopyCommand(sm2));
    return failed;
  }

  // 包内公钥 vs 验证方信任公钥：都给出且均为 hex 时直接比对（防「连公钥一起换掉」的替换包）
  if (typeof sm2.publicKey === 'string' && /^[0-9a-fA-F]+$/.test(sm2PubkeyOpt)) {
    sm2.publicKey.toLowerCase() === sm2PubkeyOpt.toLowerCase()
      ? ok(`${label}包内公钥与信任公钥一致`)
      : bad(`${label}包内公钥与信任公钥一致`, '不一致——包内 publicKey 可能被替换（canonical 不覆盖该字段）');
    if (sm2.publicKey.toLowerCase() !== sm2PubkeyOpt.toLowerCase()) failed = true;
  }

  const r = sm2Verify(canonical, sm2PubkeyOpt, sm2);
  if (r.error) {
    bad(`${label}signature.sm2 验签`, r.error);
    return true;
  }
  r.ok
    ? ok(`${label}signature.sm2 验签（SM2-with-SM3，第三方公钥独立验）`, `userId=${sm2.userId}`)
    : bad(`${label}signature.sm2 验签`, '验签不通过（内容被改 / 公钥或 userId 不符）');
  return failed || !r.ok;
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

const isV3 = ev.format === 'keelbase-audit-evidence/3';
if (['keelbase-audit-evidence/1', 'keelbase-audit-evidence/2', 'keelbase-audit-evidence/3'].includes(ev.format)) {
  ok('格式版本', ev.format);
} else {
  bad('格式版本', ev.format ?? '(缺失)');
}

// ────────────────────────── v1 / v2（单链全量，原有逻辑不变）──────────────────────────
let chainValid = false;
let rowsCount = 0;
let recomputed = 0;
let sideAnchorOk = true;
/** 失败定位（供 HTML 报告「断链 @ 行 N」；未失败为 undefined）。 */
let brokenAt;
/** §11 签名校验失败（含 SM2 验签不通过、要求验签却缺国密库）——独立于链判定，出现即 FAIL。 */
let sigFailed = false;
/** §11.3 根锚校验失败（包不在锚覆盖范围内 / 锚聚合不自洽）——出现即 FAIL。 */
let anchorFailed = false;

if (!isV3) {
  const rows = ev.chain ?? [];
  rowsCount = rows.length;
  if (rows.length > 0) ok('链行数', `${rows.length} 条（seq ${rows[0]?.seq}–${rows[rows.length - 1]?.seq}）`);
  else bad('链行数', '空链');

  // 1. 结构验证（无需密钥）
  let structural = true;
  const seqBad = rows.findIndex((r, i) => r.seq !== i + 1);
  if (seqBad > -1) { structural = false; brokenAt = rows[seqBad]?.seq ?? seqBad + 1; bad('seq 沿 id 升序（1 起连续）', 'seq 断裂'); }
  if (rows.some((r) => !/^[0-9a-f]{64}$/.test(r.hash ?? ''))) { structural = false; bad('每条 hash 为 64 hex', '含非法 hash'); }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].prevHash !== rows[i - 1].hash) { structural = false; brokenAt = rows[i].seq; bad('prevHash 连续', `断链@${rows[i].seq}：${rows[i].prevHash?.slice(0, 12) ?? 'null'} ≠ ${rows[i - 1].hash?.slice(0, 12)}`); break; }
  }
  if (structural) ok('链结构：seq 连续 + hash 64 hex + prevHash 连续', '可检测删行/换序/断链');
  if (rows.length && rows[0].prevHash != null) bad('首行 genesis（prevHash 为 null）', `实得 ${rows[0].prevHash}`);

  // 2. 全量重算（--key）
  if (keys.length === 0) {
    console.log('\n  — 未提供 --key，跳过内容重算（链结构已验证）。加 --key <AUDIT_HMAC_KEY> 全量重算内容。');
  } else {
    let mismatchAt = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const matched = keys.some((k) => chainHash(k, r.prevHash, r.payload) === r.hash);
      if (!matched) { mismatchAt = r.seq; break; }
      recomputed++;
    }
    if (mismatchAt < 0) ok(`内容重算（--key）：${rows.length} 条 payload 重算全部匹配`, `密钥数=${keys.length}`);
    else { brokenAt = mismatchAt; bad('内容重算（--key）', `seq ${mismatchAt} 重算不匹配（内容被篡改或密钥不符）`); }
  }

  // 3. 证据包签名验证（§11 形态分派）。**移出 --key 分支**：SM2 是第三方持公钥独立验签，
  //    与「应用内共享密钥」无关——只给 --sm2-pubkey 而不给 --key 时也必须能验。
  const pkgCanonical = JSON.stringify({
    summary: ev.report?.summary,
    hashChain: ev.report?.hashChain,
    effectDiffs: ev.report?.effectDiffs,
    ...(ev.format === 'keelbase-audit-evidence/2' ? { compliance: ev.compliance } : {}),
    chain: ev.chain,
    exportedAt: ev.exportedAt,
  });
  if (checkSignatureBlock(ev.signature, pkgCanonical, '证据包')) sigFailed = true;
  chainValid = structural && (keys.length === 0 || recomputed === rows.length) && (!rows.length || rows[0].prevHash == null);
}

// ────────────────────────── v3（① 证据根：单条业务动作跨链）──────────────────────────
else {
  const aiRows = Array.isArray(ev.chains?.aiAudit) ? ev.chains.aiAudit : [];
  const opRows = Array.isArray(ev.chains?.operationAudit) ? ev.chains.operationAudit : [];
  const allRows = [...aiRows, ...opRows];
  rowsCount = allRows.length;
  const anchors = Array.isArray(ev.root?.anchors) ? ev.root.anchors : [];

  if (ev.action?.effectId) ok('动作标识（AUDIT-ID）', `${ev.action?.id ?? '(缺失)'}（resultType:resultId → effectId ${ev.action.effectId}）`);
  else bad('动作标识（AUDIT-ID）', ev.action?.id ? '缺 effectId（证据根须锚定具体副作用目标）' : '缺 action 段');
  if (ev.action && ev.action.id === `${ev.action.resultType}:${ev.action.resultId}`) ok('action.id 与 resultType:resultId 一致');
  else bad('action.id 与 resultType:resultId 一致', ev.action?.id ?? '(缺失)');

  // 结构：子链行 hash 格式 + 根锚自洽（无需密钥即可验 digest）
  let structural = true;
  if (allRows.some((r) => !/^[0-9a-f]{64}$/.test(r.hash ?? ''))) { structural = false; bad('子链每条 hash 为 64 hex', '含非法 hash'); }
  if (anchors.length === 0) { structural = false; bad('根锚非空', '无 anchors'); }
  if (anchors.some((a) => !/^[0-9a-f]{64}$/.test(a.hash ?? ''))) { structural = false; bad('每个锚 hash 为 64 hex', '含非法锚 hash'); }
  const digestOk = ev.root?.digest === createHash('sha256').update(JSON.stringify(anchors)).digest('hex');
  digestOk ? ok('root.digest 自洽（sha256(canonical anchors) 可复现）', `anchors=${anchors.length}`) : bad('root.digest 自洽', 'digest 不匹配（anchors 被改动）');
  if (structural && digestOk) ok('证据根结构：锚非空 + hash 64hex + digest 自洽', '可检测换锚/改锚内容');
  else if (structural) ok('证据根结构：锚非空 + hash 64hex', '');

  if (keys.length === 0) {
    console.log('\n  — 未提供 --key，跳过子链内容重算与整包签名。加 --key <AUDIT_HMAC_KEY> 全量重算。');
    chainValid = structural && digestOk;
  } else {
    // 子链逐行重算（ai + operation 同协议 HMAC）
    let mismatch = -1;
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (!keys.some((k) => chainHash(k, r.prevHash, r.payload) === r.hash)) { mismatch = r.seq ?? i + 1; break; }
      recomputed++;
    }
    if (mismatch < 0) ok(`子链内容重算（--key）：${allRows.length} 行 payload 全部匹配`, 'aiAudit + operationAudit');
    else { brokenAt = mismatch; bad('子链内容重算（--key）', `行 ${mismatch} 重算不匹配（内容被篡改或密钥不符）`); }

    // side-effect 锚：effect 投影 canonical 摘要复现
    const sideAnchor = anchors.find((a) => a.kind === 'side-effect');
    if (sideAnchor) {
      sideAnchorOk = createHash('sha256').update(JSON.stringify(ev.effect)).digest('hex') === sideAnchor.hash;
      sideAnchorOk ? ok('副作用锚自洽（sha256(effect 投影) 复现）', `effectId ${ev.effect?.id}`) : bad('副作用锚自洽', 'effect 内容被改动');
    } else {
      console.log('  — 无 side-effect 锚（副作用缺失或选择不含）。');
    }

    chainValid = structural && digestOk && recomputed === allRows.length && sideAnchorOk;
  }

  // 整包签名（v3 canonical：action/authorization/decision/effect/chains/root/exportedAt + summary/replay——存在才含，向后兼容已导出无新段的 v3）
  // 移出 --key 分支：SM2 分支只凭第三方公钥即可独立验签（§11.2），不应被「未提供共享密钥」挡掉。
  const rootCanonical = JSON.stringify({
    action: ev.action,
    authorization: ev.authorization ?? null,
    decision: ev.decision,
    effect: ev.effect,
    chains: ev.chains,
    root: ev.root,
    exportedAt: ev.exportedAt,
    ...(ev.summary ? { summary: ev.summary } : {}),
    ...(ev.replay ? { replay: ev.replay } : {}),
  });
  if (checkSignatureBlock(ev.signature, rootCanonical, '证据根')) sigFailed = true;

  // §11.3 根锚（可选）：本包是否在该日锚覆盖范围内
  if (anchorOpt) {
    if (checkAnchorFile(anchorOpt, ev)) anchorFailed = true;
  }
}

// 结论
const passCount = cases.filter((c) => c.pass).length;
const signatureOk = keys.length === 0 || ev.signature == null || cases.some((c) => c.name.includes('签名') && c.pass);
const verdict = chainValid && (signatureOk || keys.length === 0) && !sigFailed && !anchorFailed ? 'PASS' : 'FAIL';
console.log(`\n═══ 验证结论：${verdict}（${passCount}/${cases.length} 断言通过）═══`);
console.log(chainValid
  ? (isV3 ? `证据根完整：锚自洽` + (keys.length ? ` + ${recomputed}/${rowsCount} 子链行重算一致` : '（未做内容重算）') : `链完整：结构连续` + (keys.length ? ` + ${recomputed}/${rowsCount} 内容重算一致` : '（未做内容重算）'))
  : '不完整：存在篡改/断链');

// ── 交付物层 D-2（docs/evidence-report.spec.md）：--format=html 生成自包含 HTML 报告（默认 json 路径不变）──
if (formatOpt === 'html') {
  const html = renderHtml(
    ev,
    { ok: verdict === 'PASS', mode: keys.length ? 'full' : 'structure', brokenAt, rowsCount },
    { lang: langOpt, pkgName: basename(fileArg) },
  );
  const outPath = outOpt ?? resolve(dirname(fileArg), `${basename(fileArg).replace(/\.[^.]+$/, '')}.report.html`);
  writeFileSync(outPath, html);
  console.log(`报告：${outPath}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
}

// 报告
const elapsed = Date.now() - startMs;
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const report = {
  gate: 'A2 审计证据包离线验证（证据分层 L1）',
  source: fileArg,
  format: ev.format,
  mode: keys.length ? 'full (structure + content recompute + signature)' : 'structure-only',
  verdict,
  rows: rowsCount,
  recomputed,
  exportedAt: ev.exportedAt,
  cases,
  elapsedSec: Math.round(elapsed / 1000),
};
mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
const base = resolve(__dirname, `../docs/benchmark/evidence-verify-${ts}`);
writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
const md = [
  `# A2 审计证据包离线验证（${ts}）`, '',
  `- **${verdict}** ｜ ${rowsCount} 条链 ｜ 模式：${report.mode} ｜ 导出时间 ${ev.exportedAt}`, '',
  '| # | 断言 | 结果 | 详情 |', '|---|------|------|------|',
  ...cases.map((c, i) => `| ${i + 1} | ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`), '',
].join('\n');
writeFileSync(`${base}.md`, md);
console.log(`报告：docs/benchmark/evidence-verify-${ts}.md`);
process.exit(verdict === 'PASS' ? 0 : 1);
