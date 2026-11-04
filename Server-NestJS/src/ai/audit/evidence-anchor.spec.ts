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
import { ConfigService } from '@nestjs/config';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import {
  EvidenceAnchor,
  aggregateRootDigest,
  buildAnchor,
  groupDigestsByDate,
  normalizeDigests,
  verifyAnchor,
  verifyAnchorCoverage,
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

  describe('尾部删除：锚 + 当前集合对照（红/绿）', () => {
    // Real A→B→C chain; hashes come from the production AuditChainService, algorithm not mocked.
    // 真实构造链 A→B→C：哈希用生产 AuditChainService 现算，不 mock 算法。
    const svc = new AuditChainService({
      get: (k: string) =>
        ({ ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' } as Record<string, string>)[k] ?? null,
    } as unknown as ConfigService);
    const payloads = [
      { action: 'chat', userId: '1' },
      { action: 'tool_call', userId: '1', tool: 'lookup_customer' },
      { action: 'tool_call', userId: '1', tool: 'create_todo' },
    ];
    const h1 = svc.computeHash(null, payloads[0]);
    const h2 = svc.computeHash(h1, payloads[1]);
    const h3 = svc.computeHash(h2, payloads[2]);
    const rows = [
      { id: 1, prevHash: null as string | null, hash: h1, payload: payloads[0] },
      { id: 2, prevHash: h1, hash: h2, payload: payloads[1] },
      { id: 3, prevHash: h2, hash: h3, payload: payloads[2] },
    ];
    const payloadFor = (r: { payload: Record<string, unknown> }) => r.payload;
    const DATE = '2026-09-18';

    // Same algorithm as getEvidenceRoot: root.anchors covers the trigger ai-audit row plus one
    // side-effect row, digest = sha256(JSON.stringify(anchors)). Deleting C leaves no trigger,
    // so the package's root anchors change.
    // 与 getEvidenceRoot 同一算法：root.anchors 覆盖「触发该动作的 ai-audit 行」+ 一条副作用行，
    // digest = sha256(JSON.stringify(anchors))。C 被删时触发行为空，包根锚随之变化。
    const packageFor = (trigger: (typeof rows)[number] | null) => {
      const anchors = [
        ...(trigger ? [{ kind: 'ai-audit', rowId: trigger.id, hash: trigger.hash }] : []),
        { kind: 'side-effect', rowId: 42, hash: 'e'.repeat(64) },
      ].sort((a, b) => `${a.kind}:${a.rowId}`.localeCompare(`${b.kind}:${b.rowId}`));
      return {
        exportedAt: `${DATE}T01:00:00.000Z`,
        root: { digest: createHash('sha256').update(JSON.stringify(anchors)).digest('hex') },
      };
    };
    const anchorFor = (pkgs: ReturnType<typeof packageFor>[]) =>
      buildAnchor({ date: DATE, digests: groupDigestsByDate(pkgs).get(DATE) ?? [], sm2: cfg() });
    const digestsFor = (pkgs: ReturnType<typeof packageFor>[]) =>
      groupDigestsByDate(pkgs).get(DATE) ?? [];

    it('绿：完整链 A→B→C + 锚 ⇒ 链、锚、集合对照都干净', () => {
      expect(svc.verifyChain(rows, payloadFor).valid).toBe(true);
      const anchor = anchorFor([packageFor(rows[2])]);
      expect(verifyAnchor(anchor).ok).toBe(true);
      expect(verifyAnchorCoverage(anchor, digestsFor([packageFor(rows[2])]))).toMatchObject({
        ok: true,
        missing: [],
        extra: [],
      });
    });

    it('红：链截成 A→B（C 被删）而锚不变 ⇒ 链与锚自身仍 PASS，集合对照检出尾部缺失', () => {
      // The anchor is the A→B→C set; then C is deleted and the anchor stays as published.
      // 锚定的是 A→B→C 时的集合；此后 C 被删，锚保持原样。
      const anchor = anchorFor([packageFor(rows[2])]);
      const truncated = rows.slice(0, 2);
      // This is the gap: the truncated chain is still a valid prefix and the anchor itself was not
      // changed — neither reports anything.
      // 这一半正是缺口：截断后的链仍是合法前缀，锚自身也未被改 —— 两者都不报错。
      expect(svc.verifyChain(truncated, payloadFor).valid).toBe(true);
      expect(verifyAnchor(anchor).ok).toBe(true);
      // C was the row covered by the package's root anchor: after deletion a re-export resolves no
      // trigger (getEvidenceRoot cannot find the deleted row), so the package's anchors change and
      // the anchored digest is absent from the current set.
      // C 是该包根锚覆盖的触发行：C 删掉后重导时触发行为空（getEvidenceRoot 指不到已删的行），
      // 包根锚随之变化 ⇒ 锚中的 digest 在当前集合中缺席。
      const coverage = verifyAnchorCoverage(anchor, digestsFor([packageFor(null)]));
      expect(coverage.ok).toBe(false);
      expect(coverage.missing).toHaveLength(1);
      expect(coverage.reasons.join('')).toMatch(/尾部缺失/);
    });

    it('锚记录的 digest 在当前集合中缺失 → 逐条点名（不是只给一个总判）', () => {
      const anchor = anchorFor([packageFor(rows[2])]);
      const coverage = verifyAnchorCoverage(anchor, []);
      expect(coverage.ok).toBe(false);
      expect(coverage.missing).toEqual(anchor.digests);
      expect(coverage.reasons.join('')).toContain(anchor.digests[0].slice(0, 16));
    });
  });
});
