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
});
