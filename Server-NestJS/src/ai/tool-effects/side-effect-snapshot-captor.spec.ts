// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { SideEffectSnapshotCaptor } from './side-effect-snapshot-captor';

describe('SideEffectSnapshotCaptor (E-1 字段级变更快照)', () => {
  let captor: SideEffectSnapshotCaptor;
  let entityManager: { getRepository: jest.Mock };

  beforeEach(async () => {
    entityManager = { getRepository: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SideEffectSnapshotCaptor,
        { provide: getEntityManagerToken(), useValue: entityManager },
      ],
    }).compile();
    captor = module.get(SideEffectSnapshotCaptor);
  });

  describe('normalize', () => {
    it('null/undefined → null', () => {
      expect(captor.normalize(null)).toBeNull();
      expect(captor.normalize(undefined)).toBeNull();
    });

    it('Date → ISO 字符串', () => {
      const out = JSON.parse(captor.normalize({ at: new Date('2026-08-30T00:00:00Z') })!);
      expect(out.at).toBe('2026-08-30T00:00:00.000Z');
    });

    it('敏感键掩码（password/token/secret）', () => {
      const out = JSON.parse(
        captor.normalize({ title: 'x', password: 'p', apiKey: 'k', note: 'ok' })!,
      );
      expect(out.password).toBe('[REDACTED]');
      expect(out.apiKey).toBe('[REDACTED]');
      expect(out.title).toBe('x');
    });

    it('超长字符串截断 200 字符', () => {
      const out = JSON.parse(captor.normalize({ body: 'a'.repeat(500) })!);
      expect((out.body as string).length).toBeLessThanOrEqual(201);
      expect(out.body).toContain('…');
    });

    it('循环引用按深度截断降级（不栈溢出、不抛错）', () => {
      const c: Record<string, unknown> = {};
      c.self = c;
      const out = captor.normalize(c);
      expect(out).not.toBeNull();
      const parsed = JSON.parse(out!) as Record<string, unknown>;
      let node: unknown = parsed;
      while (node != null && typeof node === 'object') {
        node = (node as Record<string, unknown>).self;
      }
      expect(node).toBe('[max-depth]');
    });
  });

  describe('captureAfter', () => {
    it('本地实体（event）按 resultId 重查全量字段转 JSON', async () => {
      const eventRepo = { findOne: jest.fn().mockResolvedValue({ id: 42, title: '晨会', startTime: new Date('2026-08-30T01:00:00Z') }) };
      entityManager.getRepository.mockReturnValue(eventRepo);
      const out = await captor.captureAfter('event', 42);
      expect(entityManager.getRepository).toHaveBeenCalledWith('Event');
      const parsed = JSON.parse(out!);
      expect(parsed.id).toBe(42);
      expect(parsed.title).toBe('晨会');
    });

    it('B 路径外部（proxy_call）无本地实体 → 用 fallback（execute 返回数据）', async () => {
      const out = await captor.captureAfter('proxy_call', 0, { id: 9, status: 'updated' });
      expect(entityManager.getRepository).not.toHaveBeenCalled();
      const parsed = JSON.parse(out!);
      expect(parsed.status).toBe('updated');
    });

    it('实体查不到 → null（优雅降级，不断写路径）', async () => {
      const eventRepo = { findOne: jest.fn().mockResolvedValue(null) };
      entityManager.getRepository.mockReturnValue(eventRepo);
      expect(await captor.captureAfter('event', 999)).toBeNull();
    });

    it('查询抛错 → null（try/catch 兜底）', async () => {
      entityManager.getRepository.mockImplementation(() => ({
        findOne: jest.fn().mockRejectedValue(new Error('db down')),
      }));
      expect(await captor.captureAfter('event', 1)).toBeNull();
    });
  });
});
