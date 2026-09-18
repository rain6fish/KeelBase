// SPDX-License-Identifier: Apache-2.0

/**
 * 证据根定期锚（docs/evidence-root.spec.md §11.3）单元测试。
 * 断言都选在「实现错就必然失败」的观测面：换集合顺序必得同 rootDigest（确定性）、改一个 digest 必 FAIL、
 * 换验证方公钥必 FAIL、无私钥必拒产。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EvidenceAnchor,
  aggregateRootDigest,
  buildAnchor,
  groupDigestsByDate,
  normalizeDigests,
  verifyAnchor,
} from './evidence-anchor';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function opensslUsable(): boolean {
  try {
    return /^OpenSSL (1\.1\.1|3|[4-9])/.test(
      execFileSync('openssl', ['version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
    );
  } catch {
    return false;
  }
}
const HAS_OPENSSL = opensslUsable();

describe('聚合算法（§11.3 补全：确定性 + 第三方可复现）', () => {
  it('归一化：升序 + 去重（集合语义，与输入顺序无关）', () => {
    expect(normalizeDigests([C, A, B])).toEqual([A, B, C]);
    expect(normalizeDigests([B, B, A, A, C])).toEqual([A, B, C]);
    expect(normalizeDigests([])).toEqual([]);
  });

  it('非法 digest 明确报错，不静默丢弃', () => {
    expect(() => normalizeDigests(['not-hex'])).toThrow(/非法/);
    expect(() => normalizeDigests(['A'.repeat(64)])).toThrow(/非法/); // 大写不接受：形状固定小写
  });

  it('rootDigest 与手工 sha256(JSON.stringify(sorted)) 一致', () => {
    const expected = createHash('sha256').update(JSON.stringify([A, B, C])).digest('hex');
    expect(aggregateRootDigest([C, A, B])).toBe(expected);
  });

  it('同一集合换顺序 → 同一 rootDigest；增删一个 → 必变（可作为「集合被改」的检测面）', () => {
    expect(aggregateRootDigest([A, B, C])).toBe(aggregateRootDigest([B, C, A]));
    expect(aggregateRootDigest([A, B])).not.toBe(aggregateRootDigest([A, B, C]));
  });
});

describe('按导出日期分组', () => {
  it('按 exportedAt 的 UTC 日期分组，跳过缺项', () => {
    const byDate = groupDigestsByDate([
      { exportedAt: '2026-09-18T01:00:00.000Z', root: { digest: A } },
      { exportedAt: '2026-09-18T23:59:59.000Z', root: { digest: B } },
      { exportedAt: '2026-09-19T00:00:00.000Z', root: { digest: C } },
      { exportedAt: '2026-09-18T02:00:00.000Z' }, // 缺 root.digest
      { root: { digest: A } }, // 缺 exportedAt
    ]);
    expect([...byDate.keys()].sort()).toEqual(['2026-09-18', '2026-09-19']);
    expect(byDate.get('2026-09-18')!.sort()).toEqual([A, B]);
    expect(byDate.get('2026-09-19')).toEqual([C]);
  });
});

describe('无 SM2 私钥时拒产（执行包 §6.4：不产出看起来像证据的非证据）', () => {
  it('sm2=null → 抛错', () => {
    expect(() => buildAnchor({ date: '2026-09-18', digests: [A], sm2: null })).toThrow(/SM2 私钥/);
  });

  it('日期格式非法 → 抛错', () => {
    expect(() =>
      buildAnchor({ date: '2026/09/18', digests: [A], sm2: { privateKeyPem: 'x', userId: 'u' } }),
    ).toThrow(/YYYY-MM-DD/);
  });
});

const describeIfOpenssl = HAS_OPENSSL ? describe : describe.skip;

describeIfOpenssl('锚产出 + 独立校验（需 openssl）', () => {
  let dir: string;
  let priv: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'anchor-spec-'));
    const privPath = join(dir, 'k.pem');
    execFileSync('openssl', ['genpkey', '-algorithm', 'SM2', '-out', privPath]);
    priv = readFileSync(privPath, 'utf8');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const cfg = () => ({ privateKeyPem: priv, keyId: 'k-1', userId: '1234567812345678' });

  it('产物满足 wire 契约形状，且自校验通过', () => {
    const anchor = buildAnchor({ date: '2026-09-18', digests: [A, B], sm2: cfg(), publishedAt: '2026-09-19T00:05:00.000Z' });
    expect(anchor).toMatchObject({
      period: 'daily',
      date: '2026-09-18',
      count: 2,
      rootDigest: aggregateRootDigest([A, B]),
      publishedAt: '2026-09-19T00:05:00.000Z',
    });
    expect(anchor.sm2).toMatchObject({ alg: 'SM2-with-SM3', encoding: 'raw', keyId: 'k-1' });
    expect(verifyAnchor(anchor)).toEqual({ ok: true, reasons: [] });
  });

  it('篡改 digests → rootDigest 聚合不符，校验 FAIL', () => {
    const anchor = buildAnchor({ date: '2026-09-18', digests: [A, B], sm2: cfg() });
    const tampered: EvidenceAnchor = { ...anchor, digests: [A, C] };
    const r = verifyAnchor(tampered);
    expect(r.ok).toBe(false);
    expect(r.reasons.join('')).toMatch(/rootDigest 与 digests 聚合不符/);
  });

  it('篡改 rootDigest → SM2 验签 FAIL（签名覆盖的就是它）', () => {
    const anchor = buildAnchor({ date: '2026-09-18', digests: [A, B], sm2: cfg() });
    const tampered: EvidenceAnchor = { ...anchor, rootDigest: 'd'.repeat(64) };
    const r = verifyAnchor(tampered);
    expect(r.ok).toBe(false);
    expect(r.reasons.join('')).toMatch(/rootDigest 与 digests 聚合不符|SM2 验签不通过/);
  });

  it('验证方自持公钥与锚内公钥不一致 → 明确报出（签名不覆盖 publicKey，可被连签名一起换）', () => {
    const anchor = buildAnchor({ date: '2026-09-18', digests: [A], sm2: cfg() });
    const r = verifyAnchor(anchor, { publicKeyHex: `04${'11'.repeat(64)}` });
    expect(r.ok).toBe(false);
    expect(r.reasons.join('')).toMatch(/不一致/);
  });

  it('count 与集合大小不一致 → FAIL', () => {
    const anchor = buildAnchor({ date: '2026-09-18', digests: [A, B], sm2: cfg() });
    const r = verifyAnchor({ ...anchor, count: 3 });
    expect(r.ok).toBe(false);
    expect(r.reasons.join('')).toMatch(/count/);
  });
});
