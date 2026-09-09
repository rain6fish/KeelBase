// SPDX-License-Identifier: Apache-2.0

/**
 * CE-1 语料复现测试（B1）：让生产 AuditChainService 跑 specs/protocol 同一份向量语料。
 *
 * 三方锁一致（单源规则机器强制，CE-1 L3）：
 *   现实现（scripts/lib/protocol-algorithms.mjs）== specs 金样本（generate --check CI 门禁）
 *   == 生产实现（本测试）——生产任何 canonical/hash/legacy/链语义漂移都在此红。
 *
 * 边界：密钥域分离、genesis 字面量、篡改反例等纯算法断言由语言无关
 * verify-protocol-conformance.mjs 覆盖（生产 service 候选密钥集恒含 legacy，无法复现"仅 current"场景）。
 */

import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuditChainService } from './audit-chain.service';

interface CorpusFile {
  vectorVersion: string;
  keyMaterial: { currentKey: string; altKey: string; chainSecret: string; legacyKey: string };
  cases: Array<Record<string, any>>;
}
interface CanonicalFile {
  cases: Array<{ id: string; name: string; input: Record<string, unknown>; canonicalBytes: string }>;
}

const corpus = (f: string): CorpusFile =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../specs/protocol', f), 'utf8'));

function makeService(env: Record<string, string>) {
  const config = { get: (k: string) => env[k] ?? null } as unknown as ConfigService;
  return new AuditChainService(config);
}

describe('AuditChainService · CE-1 语料复现（specs/protocol 向量 = 现实现金样本）', () => {
  const km = corpus('audit-hash-v1-vector.json').keyMaterial;
  const canonical = JSON.parse(
    readFileSync(resolve(__dirname, '../../../specs/protocol/canonical-json-v1-vector.json'), 'utf8'),
  ) as CanonicalFile;
  const hash = corpus('audit-hash-v1-vector.json');

  const caseOf = (id: string) => hash.cases.find((c) => c.id === id);
  const payloadFor = (row: { payload: Record<string, unknown> }) => row.payload;

  // 配置 A：AUDIT_HMAC_KEY = currentKey（签名用 current），ENCRYPTION_KEY=chainSecret → legacy 派生与语料一致
  const currentSvc = makeService({ ENCRYPTION_KEY: km.chainSecret, AUDIT_HMAC_KEY: km.currentKey });
  // 配置 B：未配 AUDIT_HMAC_KEY → current 回退 legacy（历史兼容路径）
  const legacySvc = makeService({ ENCRYPTION_KEY: km.chainSecret });

  it(`canonical：生产 canonical 与金样本逐例一致（${canonical.cases.length} 例，含 nested/unicode 边界）`, () => {
    for (const c of canonical.cases) {
      expect((currentSvc as any)._canonical(c.input)).toBe(c.canonicalBytes);
    }
  });

  it('hash：computeHash 精确复现金样本 hex（current key，64 hex）', () => {
    const c = caseOf('hash-hex-format');
    const got = currentSvc.computeHash(c.prevHash, c.payload);
    expect(got).toMatch(/^[0-9a-f]{64}$/);
    expect(got).toBe(c.expectHex);
  });

  it('legacy 回退：未配 AUDIT_HMAC_KEY 时签名 == 语料 legacy 链首行 hash（生产历史兼容路径）', () => {
    const rotation = caseOf('chain-key-rotation');
    const legacyRow0 = rotation.rows[0];
    expect(legacySvc.computeHash(null, legacyRow0.payload)).toBe(legacyRow0.hash);
  });

  it('链校验：3 条连续记录全过（current key）', () => {
    const c = caseOf('chain-ok');
    expect(currentSvc.verifyChain(c.rows, payloadFor)).toEqual({ valid: true, checked: c.expect.checked });
  });

  it('篡改检测：改中间记录 → 断链@2（payloadFor 覆盖表达篡改）', () => {
    const c = caseOf('chain-tamper-broken2');
    const overrideId = c.payloadOverrides[0].id;
    const overridden = (row: { id: number; payload: Record<string, unknown> }) =>
      row.id === overrideId ? c.payloadOverrides[0].payload : row.payload;
    const r = currentSvc.verifyChain(c.rows, overridden);
    expect(r.valid).toBe(false);
    expect(r.brokenIndex).toBe(c.expect.brokenIndex);
  });

  it('密钥轮换：候选集 [current, legacy] 可验 legacy 旧链（生产恒含 legacy 兼容）', () => {
    const c = caseOf('chain-key-rotation');
    expect(currentSvc.verifyChain(c.rows, payloadFor)).toEqual({ valid: true, checked: c.expect.checked });
  });
});
