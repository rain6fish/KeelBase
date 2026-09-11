#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * CE-1 确定性算法向量语料生成器（B1/B2 最小切片）。
 *
 * 由当前 Node 现实现（scripts/lib/protocol-algorithms.mjs = 参考实现）生成
 * specs/protocol/ 下 4 份机器可校验语料：
 *   - canonical-json-v1-vector.json   canonicalJSON 金样本（含 flat/nested/array/null/number/unicode/undefined）
 *   - audit-hash-v1-vector.json       §2 hash / legacy 派生 / 链校验向量（含正反例）
 *   - delegation-token-v1-vector.json §3 委托 token 用例（claims 模板 + verifier 设置，相对时间，确定性）
 *   - risk-level-v1-vector.json       §4 风险分级派生 + RISK_STRATEGY 表
 *
 * 金样本由现实现生成（实证优先，不预设"正确答案"）；协议文档 §2.3 为嵌套边界语义（replacer 名单外
 * 的嵌套键会被过滤——实现语义以此为准）。语料文件不含时间戳 → 输出确定性 → 可 CI diff。
 *
 * 用法：
 *   node scripts/generate-protocol-vectors.mjs            # 写/覆盖 specs 语料（语义变更时用）
 *   node scripts/generate-protocol-vectors.mjs --check    # 重算并与已提交语料 diff，不一致 exit 1（CI 漂移门禁）
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJSON,
  legacyChainKey,
  chainHash,
  signJwt,
  RISK_STRATEGY,
  resolveRiskLevel,
  needsConfirmation,
  GATE_OUTCOME_BY_STRATEGY,
  DENY_CHECKS,
} from './lib/protocol-algorithms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = resolve(__dirname, '../specs/protocol');
const serialize = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

/* ═══════════ 共享密钥材料（复现/测试与此引用一致，勿在别处硬编码） ═══════════ */

const keyMaterial = {
  currentKey: 'ab'.repeat(32), // 模拟 AUDIT_HMAC_KEY（64 hex）
  altKey: 'cd'.repeat(32), // 第二把 current —— 验证密钥域隔离
  chainSecret: 'conformance-test-secret-0123456789', // legacy 派生 seed（= ENCRYPTION_KEY || JWT_SECRET 语义）
  delegationSecret: 'conformance-delegation-secret-0123456789',
};
keyMaterial.legacyKey = legacyChainKey(keyMaterial.chainSecret);

/* ═══════════ canonical 金样本（§2.3，B2） ═══════════ */

const canonicalCases = [
  {
    id: 'sort-flat',
    name: 'canonicalJSON 顶层键按名称排序',
    comment: '扁平对象：replacer 数组即排序后顶层键集，输出按字典序。',
    input: { b: 1, a: 2 },
  },
  {
    id: 'undefined-null-flat',
    name: 'canonicalJSON undefined 剔除 + null 保留（扁平 payload）',
    comment: '值为 undefined 的键不进排序键集；null 保留。JSON 语料无法表达 undefined 值（序列化即丢），金样本由生成时含 c:undefined 的内存对象产出；语料侧输入为剔除后的等价对象。真实 undefined 剔除由 TS 复现测试覆盖。',
    input: { b: null, a: 1 },
  },
  {
    id: 'unicode',
    name: 'canonicalJSON unicode 键排序与值保真',
    comment: '键按 UTF-16 code unit 排序（ASCII 键 < CJK 键 < 代理对 emoji 键）；非 ASCII 值不经转义保留。',
    input: { z: 9, name: '张三', 备注: '值', '🐟': '🐟' },
  },
  {
    id: 'nested-filtered',
    name: 'canonicalJSON 嵌套对象不在排序键集内的键被过滤',
    comment: 'replacer 数组作用于各层：a 的值 {x,y} 中 x/y 不在顶层键集 → 丢弃 → 空对象。',
    input: { a: { x: 1, y: 2 }, b: 5 },
  },
  {
    id: 'nested-same-name-kept',
    name: 'canonicalJSON 嵌套对象与排序键同名的键被保留',
    comment: '边界：嵌套键恰与排序键集内某键同名时被 replacer 保留（a:{a,c} → a 保留、c 丢弃）。',
    input: { a: { a: 1, c: 2 }, b: 3 },
  },
  {
    id: 'array-element-filtered',
    name: 'canonicalJSON 数组元素对象的属性同样被名单过滤、null/标量保留',
    comment: '数组整体序列化；元素对象属性不在排序键集 → 过滤为 {}。',
    input: { a: [{ x: 1, y: 2 }, null, 7], b: 3 },
  },
  {
    id: 'numeric-edges',
    name: 'canonicalJSON 数值序列化边界（-0/指数/小数/负）',
    comment: 'JSON.stringify 语义：-0 → 0、1e21 → 1e+21。',
    input: { a: -0, b: 1e21, c: 1.5, d: -2 },
  },
  {
    id: 'empty-and-bool',
    name: 'canonicalJSON 空对象/空串/false/null 保真',
    comment: 'falsy 值全部保留，仅 undefined 剔除。',
    input: { a: {}, b: '', c: false, d: null },
  },
  {
    id: 'many-keys-sorted',
    name: 'canonicalJSON 多键字典序排序稳定',
    comment: '乱序声明 → 稳定字典序输出。',
    input: { z: 9, y: 8, a: 1, m: 13, b: 2 },
  },
];
const canonicalFile = {
  vectorVersion: 'v1',
  protocol: 'ai-governance-protocol §2.3 canonicalJSON',
  license: 'Apache-2.0',
  note: '由 node scripts/generate-protocol-vectors.mjs 生成，勿手改。语义变更先升 v2 再改实现（CE-1 L3 单源规则）。',
  algorithm: 'canonicalJSON(payload) = JSON.stringify(payload, sortedKeys)；sortedKeys = 顶层键剔除 undefined 后字典序。',
  cases: canonicalCases.map((c) => ({
    ...c,
    canonicalBytes: canonicalJSON(c.input),
  })),
};

/* ═══════════ 审计哈希链向量（§2，B1） ═══════════ */

const hashCases = [];
const payloadOf = { action: 'tool_call', userId: '42', detail: 'query_customers' };

hashCases.push({
  id: 'hash-hex-format',
  name: 'chainHash 输出 64 hex',
  kind: 'hex',
  key: keyMaterial.currentKey,
  prevHash: null,
  payload: payloadOf,
  expectHex: chainHash(keyMaterial.currentKey, null, payloadOf),
});
hashCases.push({
  id: 'hash-deterministic',
  name: 'chainHash 确定性（同输入同输出）',
  kind: 'determinism',
  key: keyMaterial.currentKey,
  prevHash: null,
  payload: payloadOf,
  expectHex: chainHash(keyMaterial.currentKey, null, payloadOf),
});
hashCases.push({
  id: 'hash-tamper-sensitive',
  name: '篡改 payload → hash 变化（防篡改）',
  kind: 'tamper',
  key: keyMaterial.currentKey,
  prevHash: null,
  payloadA: payloadOf,
  payloadB: { ...payloadOf, detail: 'query_contracts' },
});
hashCases.push({
  id: 'genesis-literal',
  name: 'genesis 语义：prevHash 缺省用字面量 `genesis`（与空串区分）',
  kind: 'genesis',
  key: keyMaterial.currentKey,
  payload: { action: 'a', detail: 'genesis-sample' },
});
hashCases.push({
  id: 'legacy-key-derivation',
  name: 'legacy key 派生 = HMAC-SHA256(keelbase:audit-chain:v1, secret)',
  kind: 'legacy',
  secret: keyMaterial.chainSecret,
  expectHex: keyMaterial.legacyKey,
});

// 链用例（rows 由现实现按序构建，hash/prevHash 锁进语料；反例表达断链位置）
const buildChainRows = (payloads, key) => {
  const rows = [];
  let prevHash = null;
  payloads.forEach((payload, i) => {
    const hash = chainHash(key, prevHash, payload);
    rows.push({ id: i + 1, prevHash, hash, payload });
    prevHash = hash;
  });
  return rows;
};
const chainPayloads = [
  { action: 'a1', detail: 'row-1' },
  { action: 'a2', detail: 'row-2' },
  { action: 'a3', detail: 'row-3' },
];
const legacyChainRows = buildChainRows(chainPayloads, keyMaterial.legacyKey);
const currentChainRows = buildChainRows(chainPayloads, keyMaterial.currentKey);

hashCases.push({
  id: 'chain-ok',
  name: '链校验：3 条连续记录全过',
  kind: 'chain',
  keys: [keyMaterial.currentKey],
  rows: currentChainRows,
  expect: { valid: true, checked: 3 },
});
hashCases.push({
  id: 'chain-tamper-broken2',
  name: '篡改检测：改中间记录 → 断链@2',
  kind: 'chain',
  keys: [keyMaterial.currentKey],
  rows: currentChainRows,
  payloadOverrides: [{ id: 2, payload: { action: 'a2', detail: 'TAMPERED' } }],
  expect: { valid: false, brokenIndex: 2 },
});
hashCases.push({
  id: 'chain-key-rotation',
  name: '密钥轮换：候选密钥集 [current, legacy] 可验 legacy 旧链',
  kind: 'chain',
  keys: [keyMaterial.currentKey, keyMaterial.legacyKey],
  rows: legacyChainRows,
  expect: { valid: true, checked: 3 },
});
hashCases.push({
  id: 'chain-key-domain-separation',
  name: '密钥域分离：current key 不能验 legacy 链（密钥隔离生效）',
  kind: 'chain',
  keys: [keyMaterial.altKey],
  rows: legacyChainRows,
  expect: { valid: false, brokenIndex: 1 },
});

const auditHashFile = {
  vectorVersion: 'v1',
  protocol: 'ai-governance-protocol §2 audit hash chain',
  license: 'Apache-2.0',
  note: '生成器产出。kind=chain 的 rows.payload 为业务 payload（不含 prevHash/hash/id）；hash 由现实现按序构建。',
  keyMaterial,
  cases: hashCases,
};

/* ═══════════ 委托 token 向量（§3，B1） ═══════════ */

const dtClaims = { sub: 'local:42', oidcSub: 'local:42', aud: 'legacy-erp', iss: 'keelbase' };
const tokenCases = [
  {
    id: 'token-valid',
    name: 'JWT HS256 签发 + 验签通过',
    kind: 'jwt',
    secret: keyMaterial.delegationSecret,
    claims: dtClaims,
    lifetime: { iatBeforeSec: 60, expAfterSec: 240 },
    verifier: { audience: 'legacy-erp' },
    expect: { ok: true, sub: 'local:42' },
  },
  {
    id: 'token-aud-reject',
    name: 'aud 限定：跨系统 audience 拒绝',
    kind: 'jwt',
    secret: keyMaterial.delegationSecret,
    claims: dtClaims,
    lifetime: { iatBeforeSec: 60, expAfterSec: 240 },
    verifier: { audience: 'another-system' },
    expect: { ok: false },
  },
  {
    id: 'token-expired',
    name: '过期检测：exp 已过 → 拒绝',
    kind: 'jwt',
    secret: keyMaterial.delegationSecret,
    claims: dtClaims,
    lifetime: { iatBeforeSec: 60, expAfterSec: -300 },
    verifier: { audience: 'legacy-erp' },
    expect: { ok: false },
  },
  {
    id: 'token-tampered',
    name: '篡改检测：payload 被改 → 签名不匹配',
    kind: 'jwt',
    secret: keyMaterial.delegationSecret,
    claims: dtClaims,
    mutate: 'payload',
    lifetime: { iatBeforeSec: 60, expAfterSec: 240 },
    verifier: { audience: 'legacy-erp' },
    expect: { ok: false },
  },
  {
    id: 'token-sub-prefix',
    name: 'sub 前缀语义：local:<userId> 统一身份映射键',
    kind: 'jwt',
    secret: keyMaterial.delegationSecret,
    claims: dtClaims,
    lifetime: { iatBeforeSec: 60, expAfterSec: 240 },
    verifier: { audience: 'legacy-erp' },
    expect: { ok: true, subPrefix: 'local:' },
  },
];

const delegationTokenFile = {
  vectorVersion: 'v1',
  protocol: 'ai-governance-protocol §3 delegation token (JWT HS256)',
  license: 'Apache-2.0',
  note: '相对时间构造（claims + lifetime 偏移），运行时以当前 clock 现签现验 → 语料无时间戳、确定性。跨实现互操作：用同一 secret + claims 模板 + verifier 设置复现同一期望。',
  sign: 'JWT HS256：header.payload.signature，signature = HMAC-SHA256(secret, header.payload)',
  cases: tokenCases,
};

/* ═══════════ 风险分级向量（§4，B1） ═══════════ */

const riskCases = [
  { id: 'r1-read', name: 'R1（读）→ auto / 无需确认', in: { riskLevel: 'R1', requiresConfirmation: false }, expect: { level: 'R1' } },
  { id: 'r3-sensitive-write', name: 'R3（业务敏感写）→ confirmation / 需确认', in: { riskLevel: 'R3', requiresConfirmation: true }, expect: { level: 'R3' } },
  { id: 'r4-high-impact', name: 'R4（高影响）→ human_approval / 需确认', in: { riskLevel: 'R4', requiresConfirmation: true }, expect: { level: 'R4' } },
  { id: 'r5-irreversible', name: 'R5（不可逆/外部）→ block / 阻断', in: { riskLevel: 'R5', requiresConfirmation: false }, expect: { level: 'R5' } },
  { id: 'derive-write', name: '派生规则：未声明写工具 → R3 confirmation', in: { riskLevel: undefined, requiresConfirmation: true }, expect: { level: 'R3' } },
  { id: 'derive-read', name: '派生规则：未声明读工具 → R1 auto', in: { riskLevel: undefined, requiresConfirmation: false }, expect: { level: 'R1' } },
].map((c) => {
  const level = resolveRiskLevel(c.in);
  return { ...c, expect: { ...c.expect, strategy: RISK_STRATEGY[level], needsConfirmation: needsConfirmation(level) } };
});

const riskFile = {
  vectorVersion: 'v1',
  protocol: 'ai-governance-protocol §4 tool risk level',
  license: 'Apache-2.0',
  note: 'RISK_STRATEGY 表 + 派生用例。expect.strategy/needsConfirmation 由现实现填充并锁进语料（防表漂移）。',
  strategies: RISK_STRATEGY,
  cases: riskCases,
};

/* ═══════════ 治理绑定向量（§4.3/§4.4，CE-3 薄片） ═══════════ */

const RISK_LEVELS = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'];
const governanceBindingFile = {
  vectorVersion: 'v1',
  protocol: 'ai-governance-protocol §4.3/§4.4 tool→policy→decision binding',
  license: 'Apache-2.0',
  note: '策略（RISK_STRATEGY 值域）→ 放行决策语义 + 授权拒绝依据词表（跨 Runtime 必须一致的可解释授权词汇）。由 scripts/lib/protocol-algorithms.mjs 单源生成；derivation 为 R0..R5 逐级展开（strategy → outcome）。',
  riskStrategy: RISK_STRATEGY,
  gateOutcomeByStrategy: GATE_OUTCOME_BY_STRATEGY,
  denyChecks: DENY_CHECKS,
  derivation: RISK_LEVELS.map((level) => ({
    riskLevel: level,
    strategy: RISK_STRATEGY[level],
    ...GATE_OUTCOME_BY_STRATEGY[RISK_STRATEGY[level]],
    needsConfirmation: needsConfirmation(level),
  })),
};

/* ═══════════ 写盘 / check ═══════════ */

const FILES = {
  'canonical-json-v1-vector.json': canonicalFile,
  'audit-hash-v1-vector.json': auditHashFile,
  'delegation-token-v1-vector.json': delegationTokenFile,
  'risk-level-v1-vector.json': riskFile,
  'governance-binding-v1-vector.json': governanceBindingFile,
};

function firstDiffLine(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { line: i + 1, expected: la[i] ?? '<eof>', actual: lb[i] ?? '<eof>' };
  }
  return null;
}

function write() {
  mkdirSync(SPECS_DIR, { recursive: true });
  for (const [name, data] of Object.entries(FILES)) {
    writeFileSync(resolve(SPECS_DIR, name), serialize(data));
    console.log(`  ✍️  specs/protocol/${name}`);
  }
}

function check() {
  let dirty = false;
  for (const [name, data] of Object.entries(FILES)) {
    const file = resolve(SPECS_DIR, name);
    if (!existsSync(file)) {
      console.error(`  ✗ specs/protocol/${name} 缺失 —— 先运行 node scripts/generate-protocol-vectors.mjs`);
      dirty = true;
      continue;
    }
    const generated = serialize(data);
    const committed = readFileSync(file, 'utf8');
    if (generated !== committed) {
      const d = firstDiffLine(generated, committed);
      console.error(`  ✗ ${name} 漂移（现实现输出 ≠ 已提交金样本）`);
      console.error(`    · 第 ${d.line} 行：现实现 ${JSON.stringify(d.expected)} vs 已提交 ${JSON.stringify(d.actual)}`);
      console.error(`    · 语义变更请先在语料层落新版本（CE-1 L3：Protocol/向量先于代码），再 node scripts/generate-protocol-vectors.mjs 重新生成并提交。`);
      dirty = true;
    } else {
      console.log(`  ✓ ${name} 与现实现一致`);
    }
  }
  process.exit(dirty ? 1 : 0);
}

const isCheck = process.argv.includes('--check');
console.log(isCheck ? '── Protocol 向量漂移检测（--check）──' : '── Protocol 向量生成 ──');
if (isCheck) check();
else write();
