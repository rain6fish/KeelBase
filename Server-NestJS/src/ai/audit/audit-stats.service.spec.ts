// SPDX-License-Identifier: Apache-2.0

/**
 * AuditStatsService（审计聚合统计）单元测试。
 *
 * 用例从 `audit.service.spec` **整段搬来、断言一字未改**——拆分的纪律是「行为不变」，
 * 而这些断言就是那条护栏；搬的时候顺手改断言，等于先把护栏拆了再拆房子。
 */
import { AuditStatsService } from './audit-stats.service';
import { AiAuditLog } from './ai-audit-log.entity';

describe('AuditStatsService（从 AuditService 拆出的聚合域）', () => {
  let logRepo: { find: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let service: AuditStatsService;

  beforeEach(() => {
    logRepo = { find: jest.fn().mockResolvedValue([]) };
    // 默认不命中缓存：每次真算，断言才测得到聚合逻辑本身
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
    service = new AuditStatsService(logRepo as never, cache as never);
  });

  describe('getCostBreakdown（AI-21）', () => {
    it('按模型/意图/用户聚合 tokens，跳过错误日志', async () => {
      logRepo.find.mockResolvedValue([
        { userId: '1', action: 'chat', model: 'deepseek-v4-flash', promptTokens: 100, completionTokens: 50, isError: false },
        { userId: '1', action: 'chat', model: 'deepseek-v4-flash', promptTokens: 200, completionTokens: 100, isError: false },
        { userId: '2', action: 'knowledge', model: 'qwen-max', promptTokens: 50, completionTokens: 10, isError: false },
        { userId: '2', action: 'chat', model: 'deepseek-v4-flash', promptTokens: 999, completionTokens: 999, isError: true }, // 跳过
      ]);

      const result = await service.getCostBreakdown();

      expect(result.summary.totalCalls).toBe(3);
      expect(result.summary.totalTokens).toBe(100 + 50 + 200 + 100 + 50 + 10);
      // 按模型：deepseek 2 次 450 tokens 排前
      expect(result.byModel[0].model).toBe('deepseek-v4-flash');
      expect(result.byModel[0].calls).toBe(2);
      expect(result.byModel[0].completionTokens).toBe(150);
      // 按意图
      expect(result.byIntent[0]).toEqual({ action: 'chat', count: 2 });
      // 按用户
      expect(result.byUser[0].userId).toBe('1');
      expect(result.byUser[0].tokens).toBe(450);
    });

    it('空日志返回全零', async () => {
      logRepo.find.mockResolvedValue([]);
      const result = await service.getCostBreakdown();
      expect(result.summary.totalCalls).toBe(0);
      expect(result.byModel).toEqual([]);
    });

    it('since 过滤传入 Between', async () => {
      logRepo.find.mockResolvedValue([]);
      await service.getCostBreakdown(new Date('2026-08-01'));
      expect(logRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) }),
      );
    });
  });

  describe('getStats / getAllStats', () => {
    const logs = [
      { action: 'chat', promptTokens: 100, completionTokens: 50, isError: false, createdAt: new Date('2026-08-30T01:00:00Z') },
      { action: 'tool_call', promptTokens: 10, completionTokens: 5, isError: false, createdAt: new Date('2026-08-30T02:00:00Z') },
      { action: 'chat', promptTokens: 30, completionTokens: 10, isError: true, createdAt: new Date('2026-08-30T03:00:00Z') },
    ];

    it('getStats 聚合 token/错误/动作分布并按次数排序', async () => {
      logRepo.find.mockResolvedValue(logs);
      const result = await service.getStats('1', new Date('2026-08-01'));
      expect(result.totalConversations).toBe(2);
      expect(result.totalMessages).toBe(3);
      expect(result.totalTokens).toBe(205);
      expect(result.totalErrors).toBe(1);
      expect(result.topActions[0]).toEqual({ action: 'chat', count: 2 });
      expect(logRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: '1', createdAt: expect.anything() }) }),
      );
    });

    it('getStats 无 since 不设时间过滤', async () => {
      logRepo.find.mockResolvedValue([]);
      await service.getStats('1');
      expect(logRepo.find).toHaveBeenCalledWith({ where: { userId: '1' } });
    });

    it('getAllStats 全量聚合（无 userId）', async () => {
      logRepo.find.mockResolvedValue(logs);
      const result = await service.getAllStats();
      expect(result.totalMessages).toBe(3);
      expect(result.totalErrors).toBe(1);
      expect(logRepo.find).toHaveBeenCalledWith({ where: {}, select: expect.objectContaining({ action: true }) });
    });

    it('E-2：getAllStats 返回 byDay 趋势（含 errors/blocked 段）', async () => {
      logRepo.find.mockResolvedValue([
        { action: 'tool_call', detail: 'query_customers({})', isError: false, createdAt: new Date('2026-08-30T10:00:00Z') },
        { action: 'tool_call', detail: 'create_followup_task({})', isError: false, createdAt: new Date('2026-08-30T11:00:00Z') },
        { action: 'tool_call', detail: 'query_evil({})', isError: true, errorMessage: 'blocked (risk level R5)', createdAt: new Date('2026-08-30T12:00:00Z') },
      ]);
      const result = await service.getAllStats();
      expect(result.byDay).toHaveLength(1);
      expect(result.byDay[0]).toMatchObject({ date: '2026-08-30', executed: 2, approved: 0, rejected: 0, blocked: 1, errors: 1 });
    });

    it('getAllStats 带 since 过滤', async () => {
      logRepo.find.mockResolvedValue([]);
      await service.getAllStats(new Date('2026-08-01'));
      expect(logRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) }),
      );
    });

    it('命中缓存时不查库（聚合结果 60s 内复用）', async () => {
      cache.get.mockResolvedValue({ totalMessages: 42 });
      const result = await service.getAllStats();
      expect(result).toMatchObject({ totalMessages: 42 });
      expect(logRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('byDay 聚合纯函数（报表域与统计域共用单源）', () => {
    it('blocked 与 executed 的口径不变：有拒绝标记才算 blocked', async () => {
      logRepo.find.mockResolvedValue([
        { action: 'tool_call', isError: true, authorization: '{"denied":{}}', createdAt: new Date('2026-09-01T00:00:00Z') },
        { action: 'tool_call', isError: true, errorMessage: 'boom', createdAt: new Date('2026-09-01T01:00:00Z') },
      ] as unknown as AiAuditLog[]);

      const result = await service.getAllStats();

      expect(result.byDay[0]).toMatchObject({ blocked: 1, executed: 0, errors: 2 });
    });
  });
});
