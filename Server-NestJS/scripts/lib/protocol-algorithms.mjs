#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * AI Governance Protocol — 确定性算法单源（语言无关可复现）。
 *
 * 只 import Node 内置（crypto），不依赖 KeelBase 源码。三大协议（docs/protocols/ai-governance-protocol.md）：
 *   1. 审计哈希链（§2）：canonicalJSON（顶层键排序 + undefined 剔除）、
 *      hash = HMAC-SHA256(key, `${prevHash ?? 'genesis'}|${canonical}`)、
 *      legacy key 派生、沿 id 升序的链校验。
 *   2. 委托 token（§3）：JWT HS256 签发 + 独立验签（aud 限定 / iss / exp / sub 前缀）。
 *   3. 工具风险分级（§4）：resolveRiskLevel 派生 + RISK_STRATEGY + requiresConfirmation。
 *
 * 消费者：verify-protocol-conformance.mjs（认证套件）、generate-protocol-vectors.mjs（语料金样本生成）、
 * 第三方实现自认证。金样本由现实现生成（实证优先），specs/protocol/*-vector.json 为机器可校验语料。
 */
import { createHmac } from 'node:crypto';

/** canonicalJSON：顶层键按名称排序、undefined 剔除、null 保留（JSON.stringify replacer 数组，作用于对象各层）。 */
export function canonicalJSON(payload) {
  const keys = Object.keys(payload).filter((k) => payload[k] !== undefined).sort();
  return JSON.stringify(payload, keys);
}

/** legacy key 派生：HMAC-SHA256(key='keelbase:audit-chain:v1', secret)。 */
export function legacyChainKey(secret) {
  return createHmac('sha256', 'keelbase:audit-chain:v1').update(secret).digest('hex');
}

/** 当前记录 hash：HMAC(key, `${prevHash ?? 'genesis'}|${canonical}`)。 */
export function chainHash(key, prevHash, payload) {
  return createHmac('sha256', key).update(`${prevHash ?? 'genesis'}|${canonicalJSON(payload)}`).digest('hex');
}

/** 链校验：沿 id 升序，prevHash 连续 + hash 匹配任一候选 key。返回 {valid, checked, brokenIndex}。 */
export function verifyChain(rows, keys, payloadFor) {
  let prevHash = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const canonical = canonicalJSON(payloadFor(row));
    if (row.prevHash !== prevHash || !keys.some((k) => chainHash(k, prevHash, payloadFor(row)) === row.hash)) {
      return { valid: false, checked: i, brokenIndex: i + 1 };
    }
    prevHash = row.hash ?? null;
  }
  return { valid: true, checked: rows.length };
}

const b64url = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');

/** JWT HS256 签发（协议 §3）：b64url(header).b64url(payload).HMAC-SHA256(secret)。 */
export function signJwt(payload, secret) {
  const h = b64url({ alg: 'HS256', typ: 'JWT' });
  const p = b64url(payload);
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

/** JWT 验签：aud 限定 / iss / exp；篡改、密钥不符、过期均拒绝。返回 {ok, reason?, payload?}。 */
export function verifyJwt(token, secret, { audience, now } = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'JWT 非 header.payload.signature 三段' };
  const [h, p, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (sig !== expected) return { ok: false, reason: '签名不匹配（payload 被篡改或密钥不符）' };
  let payload;
  try { payload = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return { ok: false, reason: 'payload 无法解析' }; }
  if (payload.iss !== 'keelbase') return { ok: false, reason: `iss 非 keelbase：${payload.iss}` };
  if (audience !== undefined && payload.aud !== audience) return { ok: false, reason: `aud 不匹配：期望 ${audience}，实得 ${payload.aud}` };
  if (now !== undefined && payload.exp && payload.exp < now) return { ok: false, reason: 'token 已过期' };
  return { ok: true, payload };
}

/** RISK_STRATEGY 表（协议 §4）。 */
export const RISK_STRATEGY = { R0: 'auto', R1: 'auto', R2: 'policy', R3: 'confirmation', R4: 'human_approval', R5: 'block' };

/** 风险级派生（协议 §4）：显式声明优先；未声明写工具 → R3 confirmation，读工具 → R1 auto。 */
export function resolveRiskLevel({ riskLevel, requiresConfirmation }) {
  if (riskLevel) return riskLevel;
  return requiresConfirmation ? 'R3' : 'R1';
}

export function needsConfirmation(level) { return ['R3', 'R4'].includes(level); }
