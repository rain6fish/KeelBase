// SPDX-License-Identifier: Apache-2.0

/**
 * AI 每日用量配额（`AiDailyUsageService`）单元测试。
 *
 * 用例从 `audit.service.spec` **整段搬来、断言一字未改**——拆分纪律是行为不变，断言就是护栏。
 * 这些断言钉的是**并发正确性**（原子条件 UPDATE 而非「读-判-写」），所以不能因为搬家而放松。
 */
import { AiDailyUsageService } from './ai-daily-usage.service';

describe('AiDailyUsageService（RG-2.1 原子预留）', () => {
  let usageRepo: { save: jest.Mock; update: jest.Mock; create: jest.Mock };
  let service: AiDailyUsageService;

  beforeEach(() => {
    usageRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1, raw: {} }),
      create: jest.fn((x: unknown) => x ?? {}),
    };
    service = new AiDailyUsageService(usageRepo as never);
  });

  describe('reserveDailyUsage / releaseDailyUsage（RG-2.1 原子预留）', () => {
    it('行不存在时先建 count=0 再原子递增 → 预留成功', async () => {
      usageRepo.save.mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT' }); // 首写冲突（行已存在）
      const ok = await service.reserveDailyUsage('42', 10);
      expect(ok).toBe(true);
      expect(usageRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '42', count: expect.anything() }),
        { count: expect.any(Function) },
      );
    });

    it('已用满（count >= limit）时 where 不命中 → 预留失败', async () => {
      usageRepo.save.mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT' });
      usageRepo.update.mockResolvedValueOnce({ affected: 0, raw: {} });
      const ok = await service.reserveDailyUsage('42', 3);
      expect(ok).toBe(false);
    });

    it('limit<=0 时无 where count 条件（不限量直接自增）', async () => {
      usageRepo.save.mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT' });
      await service.reserveDailyUsage('42', 0);
      const [criteria] = usageRepo.update.mock.calls[0];
      expect(criteria).not.toHaveProperty('count'); // 0 = 不限
    });

    it('release 只在 count>0 时递减（防负值）', async () => {
      await service.releaseDailyUsage('42');
      const [criteria, update] = usageRepo.update.mock.calls[0];
      expect(criteria).toEqual(expect.objectContaining({ userId: '42' }));
      expect(update.count).toEqual(expect.any(Function));
    });
  });
});
