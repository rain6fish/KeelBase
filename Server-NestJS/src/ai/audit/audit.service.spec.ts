import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AuditService } from './audit.service';

function makeLogRepo() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof makeLogRepo>;

  beforeEach(async () => {
    repo = makeLogRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: getRepositoryToken(AiAuditLog), useValue: repo }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  describe('countChatsToday（RG-2.1）', () => {
    it('按 userId + 当日 + 非错误过滤统计', async () => {
      repo.createQueryBuilder().getCount.mockResolvedValue(7);

      const count = await service.countChatsToday('42');

      expect(count).toBe(7);
      expect(repo.createQueryBuilder).toHaveBeenCalled();
      const qb = repo.createQueryBuilder();
      expect(qb.where).toHaveBeenCalledWith('log.userId = :userId', { userId: '42' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.createdAt >= :start',
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('log.isError = :err', { err: false });
    });
  });

  describe('log', () => {
    it('保存审计条目', async () => {
      await service.log({ userId: '1', action: 'chat', provider: 'deepseek' });
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('getCostBreakdown（AI-21）', () => {
    it('按模型/意图/用户聚合 tokens，跳过错误日志', async () => {
      repo.find.mockResolvedValue([
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
      repo.find.mockResolvedValue([]);
      const result = await service.getCostBreakdown();
      expect(result.summary.totalCalls).toBe(0);
      expect(result.byModel).toEqual([]);
    });

    it('since 过滤传入 Between', async () => {
      repo.find.mockResolvedValue([]);
      await service.getCostBreakdown(new Date('2026-08-01'));
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) }),
      );
    });
  });

  describe('submitFeedback（AI-18）', () => {
    it('找到该对话最近非错误日志并写反馈', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 5, userId: '1' }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.update = jest.fn().mockResolvedValue({ affected: 1 });

      const result = await service.submitFeedback('1', 'conv-1', 'thumbs_down', '回答不准');

      expect(result.updated).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(5, { feedback: 'thumbs_down', feedbackNote: '回答不准' });
    });

    it('无匹配日志时返回 updated=false', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.submitFeedback('1', 'nope', 'thumbs_up');
      expect(result.updated).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
