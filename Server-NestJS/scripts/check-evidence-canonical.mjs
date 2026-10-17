#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Evidence-root package canonical key-order drift gate (1.0.8 review-deferred follow-up).
 *
 * The signed canonical of `keelbase-audit-evidence/4` is
 * action/authorization/decision/effect/chains/root/coverage/exportedAt (+summary/replay when present).
 * The key order is written by hand in three places: the export side
 * (`src/ai/audit/audit-evidence.service.ts`), the offline verifier (`scripts/verify-evidence.mjs`,
 * deliberately standalone — Node built-ins only, for third-party audit), and the signature self-check
 * (`audit-evidence.service.spec.ts`). They cannot share a runtime module by design.
 *
 * This gate parses each site's text and requires the effective key orders to match byte for byte.
 * Adding or reordering a canonical key on one side without the others → divergence → FAIL. Changing the
 * canonical is a semantic change: run the C1 review checklist, update all three sites, and keep this
 * gate green.
 *
 * Anchors: the code construct that produces the signed string is the single source of the key order.
 * Parse that, not a version-stamped prose comment. At `/4` the comment was reworded
 * (`// v3 canonical` → `// /4 canonical`) and this gate went red although the key order itself had not
 * moved — the anchor was the prose, not the source. Rewording commentary must not red this gate;
 * changing the literal must.
 *
 * 证据根整包 canonical 手写序防漂移闸（1.0.8 review-deferred 收敛）：
 *
 * `keelbase-audit-evidence/4` 的整包签名 = HMAC(key, canonical) 覆盖
 * action/authorization/decision/effect/chains/root/coverage/exportedAt（+summary/replay 存在才含）。
 * canonical 键序在三处各有一份手写序：导出侧（`src/ai/audit/audit-evidence.service.ts`）、
 * 离线验证侧（`scripts/verify-evidence.mjs`，依设计只 import Node 内置、供审计机构独立验证）、
 * 签名自证（`audit-evidence.service.spec.ts`）——三者无法共享同一运行时模块。
 *
 * 本闸以「三处各自文本推导出的有效键序必须逐字节一致」把关：任一侧新增/换序 canonical 段而未同步
 * 其余 → 键序发散 → FAIL。改动 canonical 键序属语义变更 → 走 C1 语义变更评审清单，三处同步改并由
 * 本闸常绿背书。
 *
 * **锚 = 代码构造，不是带版本号的散文注释**：/4 那次把注释从 `// v3 canonical` 改写成
 * `// /4 canonical`，键序本身没动，本闸却红了 —— 因为锚在注释上。改注释不该能把它弄红，改字面量才该。
 *
 * 用法：node scripts/check-evidence-canonical.mjs   （exit 0 = 三处一致）
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// The export side moved to its own service with the evidence-domain split (health checklist §3 stage 3);
// this gate resolves by path, so the path follows the code.
// 导出侧已随证据域拆分到独立服务（健康清单 §3 阶段 3）；本闸按路径解析，故路径随代码走。
const auditPath = resolve(ROOT, 'src/ai/audit/audit-evidence.service.ts');
const verifierPath = resolve(ROOT, 'scripts/verify-evidence.mjs');
const specPath = resolve(ROOT, 'src/ai/audit/audit-evidence.service.spec.ts');

const bad = (msg) => { console.error(`  ✗ ${msg}`); };
const ok = (msg) => { console.log(`  ✓ ${msg}`); };

/** Keys from a plain object/spread literal body. A spread without a readable `{ key: … }` fails loud. */
/** 从对象/spread 字面量的正文推导键序；推不出键名的 spread 一律 fail-loud，不猜。 */
function directKeys(body, file) {
  const keys = [];
  for (const line of body.split('\n')) {
    const direct = line.match(/^\s*([A-Za-z_$][\w$]*)\s*[(:,]/);
    if (direct) { keys.push(direct[1]); continue; }
    if (/^\s*\.\.\./.test(line)) {
      // `...(cond ? { key: value } : {})` — the conditional spread's key still occupies a slot.
      // `...(cond ? { key: value } : {})` —— 条件 spread 的键同样占一个位置。
      const conditional = line.match(/\{\s*([A-Za-z_$][\w$]*)\s*:/);
      if (conditional) { keys.push(conditional[1]); continue; }
      throw new Error(`${file} 有一处 spread 推导不出键名：${line.trim()}`);
    }
  }
  return keys;
}

/** Export side: the object literal that is serialized and signed, plus its conditional tails. */
/** 导出侧：被序列化并签名的对象字面量，外加条件尾段（summary/replay）。 */
function keysFromAudit(src) {
  const anchor = 'const canonicalObj: Record<string, unknown> = {';
  const open = src.indexOf(anchor);
  if (open < 0) throw new Error('audit-evidence.service.ts 未找到 canonicalObj 字面量（canonical 键序的单源）');
  const end = src.indexOf('};', open);
  if (end < 0) throw new Error('audit-evidence.service.ts 的 canonicalObj 字面量没有闭合');
  const keys = directKeys(src.slice(open + anchor.length, end), 'audit-evidence.service.ts');
  // The conditional tails (`canonicalObj.summary = …`) are outside the literal. Derive them in **source
  // order**, not from a hard-coded list: reordering the assignments changes the real signed string, and
  // a hard-coded list would keep reporting the old order (a false PASS).
  // 条件尾段（`canonicalObj.summary = …`）在字面量之外。按**源码出现序**推导，不硬编码列表：重排赋值
  // 会改变真实的签名串，而硬编码列表会继续报旧序 —— 那是假 PASS。
  const signedAt = src.indexOf('JSON.stringify(canonicalObj)', end);
  if (signedAt < 0) throw new Error('audit-evidence.service.ts 未找到 JSON.stringify(canonicalObj)（无法确认签名对象）');
  const tailRe = /canonicalObj\.([A-Za-z_$][\w$]*)\s*=/g;
  let tail;
  while ((tail = tailRe.exec(src.slice(end, signedAt))) !== null) keys.push(tail[1]);
  return keys;
}

/** Offline verifier: the `rootCanonical` object passed to `JSON.stringify`. */
/** 离线验证侧：交给 `JSON.stringify` 的 `rootCanonical` 对象。 */
function keysFromVerifier(src) {
  const anchor = 'const rootCanonical = JSON.stringify({';
  const open = src.indexOf(anchor);
  if (open < 0) throw new Error('verify-evidence.mjs 未找到 rootCanonical 的 JSON.stringify 字面量');
  const end = src.indexOf('});', open);
  if (end < 0) throw new Error('verify-evidence.mjs 的 rootCanonical 字面量没有闭合');
  return directKeys(src.slice(open + anchor.length, end), 'verify-evidence.mjs');
}

/** Signature self-check: the canonical literal rebuilt in the spec. */
/** 签名自证：spec 里重建的 canonical 字面量。 */
function keysFromSpec(src) {
  const anchor = 'const canonical = JSON.stringify({';
  const open = src.indexOf(anchor);
  if (open < 0) throw new Error('audit-evidence.service.spec.ts 未找到签名自证的 JSON.stringify 字面量');
  const end = src.indexOf('});', open);
  if (end < 0) throw new Error('audit-evidence.service.spec.ts 的 canonical 字面量没有闭合');
  return directKeys(src.slice(open + anchor.length, end), 'audit-evidence.service.spec.ts');
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
  ['导出侧（audit-evidence.service.ts）', auditKeys],
  ['离线验证侧（verify-evidence.mjs）', verifierKeys],
  ['签名自证（audit-evidence.service.spec.ts）', specKeys],
];
const ref = auditKeys;
const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// `/4` = `/3` + a **required** `coverage` in the signed canonical (docs/evidence-root.spec.md).
// The three copies can be "consistently" wrong (the same key deleted from all three would pass the
// pairwise comparison), so the required sections are pinned here. summary/replay stay conditional.
// `/4` = `/3` 加一个**必填**的 `coverage` 进签名 canonical（docs/evidence-root.spec.md）。三处可以
// 「一致地」错（同一个键从三处一起删掉会通过两两比对），故必填段在这里钉死；summary/replay 仍按存在才含。
const REQUIRED = ['action', 'authorization', 'decision', 'effect', 'chains', 'root', 'coverage', 'exportedAt'];
const missing = REQUIRED.filter((k) => ref.indexOf(k) < 0);
// Only judge order once every required key is present — otherwise -1 would make the order check
// fire alongside the missing-key message and say two things at once.
// 必填键都在时才判顺序 —— 否则 -1 会让顺序检查跟着缺键一起报，同一件事说两遍。
const outOfOrder = missing.length === 0 && REQUIRED.some(
  (k, i) => i + 1 < REQUIRED.length && ref.indexOf(k) > ref.indexOf(REQUIRED[i + 1]),
);

// Criterion the gate must keep: a one-slot swap is detected. If this fails, the comparison has been
// neutered and a green run means nothing.
// 闸必须保有的判据：一次键位交换要判得出来。它若失效，说明比较被改坏了，绿灯就没有意义。
function driftIsDetected(keys) {
  if (keys.length < 2) return false;
  const drifted = [...keys];
  [drifted[0], drifted[1]] = [drifted[1], drifted[0]];
  return !sameOrder(drifted, keys);
}

const pass = ref.length > 0
  && missing.length === 0
  && !outOfOrder
  && sites.every(([, k]) => sameOrder(k, ref));

if (pass) {
  if (!driftIsDetected(ref)) {
    bad('自我判据失效：比较函数识别不出一次键序交换，本闸的绿灯不可信');
    process.exit(1);
  }
  ok(`证据根 /4 canonical 键序三处一致（${ref.join(' → ')}）`);
} else {
  if (missing.length > 0) bad(`必填 canonical 段缺失：${missing.join(', ')}（/4 的 coverage 必须进签名）`);
  if (outOfOrder) bad(`必填 canonical 段顺序不对：应为 ${REQUIRED.join(' → ')}`);
  if (!sites.every(([, k]) => sameOrder(k, ref))) {
    bad('证据根 /4 canonical 键序发散：三处（导出 / 离线验证 / 签名自证）未同键同序');
    for (const [label, k] of sites) console.error(`  ${label}: [${k.join(', ')}]`);
  }
  console.error('  修复：三处 canonical 保持同键同序（走 C1 语义变更清单）；或导出后先离线验证再发布。');
  process.exit(1);
}
