import { ConfigService } from '@nestjs/config';
import { AuditChainService } from './audit-chain.service';

function makeService(env: Record<string, string> = {}) {
  const config = { get: (k: string) => env[k] ?? null } as unknown as ConfigService;
  return new AuditChainService(config);
}

describe('AuditChainService (HS-11)', () => {
  let chain: AuditChainService;

  beforeEach(() => {
    chain = makeService({ ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' });
  });

  describe('computeHash', () => {
    it('同一 payload 与 prevHash 输出稳定', () => {
      const a = chain.computeHash(null, { action: 'chat', userId: '1' });
      const b = chain.computeHash(null, { action: 'chat', userId: '1' });
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });

    it('字段键序不影响 hash（canonical 排序）', () => {
      const a = chain.computeHash(null, { action: 'chat', userId: '1' });
      const b = chain.computeHash(null, { userId: '1', action: 'chat' });
      expect(a).toBe(b);
    });

    it('undefined 字段被剔除', () => {
      const a = chain.computeHash(null, { action: 'chat', detail: undefined });
      const b = chain.computeHash(null, { action: 'chat' });
      expect(a).toBe(b);
    });

    it('prevHash 参与计算（链式）', () => {
      const a = chain.computeHash('prev', { action: 'chat' });
      const b = chain.computeHash(null, { action: 'chat' });
      expect(a).not.toBe(b);
    });

    it('不同密钥产生不同 hash', () => {
      const other = makeService({ ENCRYPTION_KEY: 'ffffffffffffffffffffffffffffffff' });
      expect(chain.computeHash(null, { action: 'chat' })).not.toBe(
        other.computeHash(null, { action: 'chat' }),
      );
    });
  });

  describe('verifyChain', () => {
    const payloadFor = (row: { action: string }) => ({ action: row.action });

    it('空链校验通过', () => {
      const r = chain.verifyChain([], payloadFor);
      expect(r).toEqual({ valid: true, checked: 0 });
    });

    it('完整链校验通过', () => {
      const rows = [
        { id: 1, prevHash: null, action: 'chat' },
        { id: 2, prevHash: null, action: 'tool_call' },
      ];
      // 用真实 computeHash 构建合法链
      const h1 = chain.computeHash(null, { action: 'chat' });
      const h2 = chain.computeHash(h1, { action: 'tool_call' });
      rows[0].hash = h1;
      rows[1].prevHash = h1;
      rows[1].hash = h2;
      const r = chain.verifyChain(rows as never, payloadFor);
      expect(r.valid).toBe(true);
      expect(r.checked).toBe(2);
    });

    it('内容被篡改 → 检测断链', () => {
      const h1 = chain.computeHash(null, { action: 'chat' });
      const rows = [
        { id: 1, prevHash: null, hash: h1, action: 'chat' },
        // 第二条内容被改成别的 action，但 hash 没重算
        { id: 2, prevHash: h1, hash: chain.computeHash(h1, { action: 'chat' }), action: 'tool_call' },
      ];
      const r = chain.verifyChain(rows as never, payloadFor);
      expect(r.valid).toBe(false);
      expect(r.brokenIndex).toBe(2);
    });

    it('prevHash 不连续（记录被删/换序）→ 检测断链', () => {
      const h1 = chain.computeHash(null, { action: 'chat' });
      const rows = [
        { id: 1, prevHash: null, hash: h1, action: 'chat' },
        { id: 2, prevHash: 'wrong-prev', hash: chain.computeHash('wrong-prev', { action: 'tool_call' }), action: 'tool_call' },
      ];
      const r = chain.verifyChain(rows as never, payloadFor);
      expect(r.valid).toBe(false);
      expect(r.brokenIndex).toBe(2);
    });
  });

  describe('审计密钥分离与轮换（W4-②）', () => {
    const KEY_A = 'a'.repeat(64);
    const KEY_B = 'b'.repeat(64);
    const payloadFor = (row: { action: string }) => ({ action: row.action });

    it('配置 AUDIT_HMAC_KEY 后独立签名（不依赖 ENCRYPTION_KEY）', () => {
      const withKey = makeService({ ENCRYPTION_KEY: '1'.repeat(64), AUDIT_HMAC_KEY: KEY_A });
      const diffEnc = makeService({ ENCRYPTION_KEY: '2'.repeat(64), AUDIT_HMAC_KEY: KEY_A });
      const legacyOnly = makeService({ ENCRYPTION_KEY: '1'.repeat(64) });
      const h1 = withKey.computeHash(null, { action: 'chat' });
      expect(h1).toHaveLength(64);
      // AUDIT_HMAC_KEY 主导：换 ENCRYPTION_KEY 不影响 hash
      expect(diffEnc.computeHash(null, { action: 'chat' })).toBe(h1);
      // 未配 AUDIT_HMAC_KEY 的 legacy 派生与独立密钥不同（密钥域已分离）
      expect(legacyOnly.computeHash(null, { action: 'chat' })).not.toBe(h1);
    });

    it('轮换：保留 AUDIT_HMAC_KEY_PREVIOUS 时旧 key 记录仍可验证，新记录用新 key', () => {
      // 阶段 1：KEY_A 签名的链
      const oldSvc = makeService({ AUDIT_HMAC_KEY: KEY_A });
      const h1 = oldSvc.computeHash(null, { action: 'chat' });
      const h2 = oldSvc.computeHash(h1, { action: 'tool_call' });
      const rows = [
        { id: 1, prevHash: null, hash: h1, action: 'chat' },
        { id: 2, prevHash: h1, hash: h2, action: 'tool_call' },
      ];
      // 阶段 2：轮换到 KEY_B，保留 KEY_A 为 previous → 旧链仍可验证
      const newSvc = makeService({ AUDIT_HMAC_KEY: KEY_B, AUDIT_HMAC_KEY_PREVIOUS: KEY_A });
      expect(newSvc.verifyChain(rows as never, payloadFor)).toMatchObject({ valid: true, checked: 2 });
      // 新记录用 KEY_B 签名，续链后整体仍验证
      const h3 = newSvc.computeHash(h2, { action: 'chat' });
      const rows2 = [...rows, { id: 3, prevHash: h2, hash: h3, action: 'chat' }];
      expect(newSvc.verifyChain(rows2 as never, payloadFor).valid).toBe(true);
    });

    it('轮换未保留旧 key：旧记录 verify 断链（提示需配置 previous）', () => {
      const oldSvc = makeService({ AUDIT_HMAC_KEY: KEY_A });
      const h1 = oldSvc.computeHash(null, { action: 'chat' });
      const rows = [{ id: 1, prevHash: null, hash: h1, action: 'chat' }];
      const newSvc = makeService({ AUDIT_HMAC_KEY: KEY_B }); // 无 previous
      expect(newSvc.verifyChain(rows as never, payloadFor).valid).toBe(false);
    });
  });
});
