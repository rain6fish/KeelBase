import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AuditService } from './audit.service';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';

function makeLogRepo() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(null),
  };
  return {
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

function makeUsageRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((x) => Promise.resolve(x)),
    create: jest.fn((x) => x ?? {}),
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof makeLogRepo>;
  let usageRepo: ReturnType<typeof makeUsageRepo>;
  let chain: jest.Mocked<Pick<AuditChainService, 'computeHash' | 'verifyChain'>>;

  beforeEach(async () => {
    repo = makeLogRepo();
    usageRepo = makeUsageRepo();
    chain = {
      computeHash: jest.fn().mockReturnValue('hash-1'),
      verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AiAuditLog), useValue: repo },
        { provide: getRepositoryToken(AiDailyUsage), useValue: usageRepo },
        { provide: AuditChainService, useValue: chain },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  describe('countChatsToday / incrementDailyUsage（RG-2.1 / A2）', () => {
    it('从独立计数表读取当日用量（不依赖审计粒度）', async () => {
      usageRepo.findOne.mockResolvedValue({ userId: '42', usageDate: '2026-08-15', count: 7 });

      const count = await service.countChatsToday('42');

      expect(count).toBe(7);
      expect(usageRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: '42' }) }),
      );
    });

    it('无记录时返回 0', async () => {
      usageRepo.findOne.mockResolvedValue(null);
      await expect(service.countChatsToday('42')).resolves.toBe(0);
    });

    it('已有记录时自增 count', async () => {
      usageRepo.findOne.mockResolvedValue({ userId: '42', usageDate: '2026-08-15', count: 3 });
      await service.incrementDailyUsage('42');
      expect(usageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ count: 4 }),
      );
    });

    it('无记录时创建 count=1', async () => {
      usageRepo.findOne.mockResolvedValue(null);
      await service.incrementDailyUsage('42');
      expect(usageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '42', count: 1, usageDate: expect.any(String) }),
      );
    });

    it('并发首写冲突时改走自增路径（A2）', async () => {
      usageRepo.findOne
        .mockResolvedValueOnce(null) // 首次检查无记录
        .mockResolvedValueOnce({ userId: '42', usageDate: '2026-08-15', count: 5 }); // save 冲突后重查
      usageRepo.save.mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT' });
      await service.incrementDailyUsage('42');
      expect(usageRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ count: 6 }));
    });
  });

  describe('log（HS-11 哈希链）', () => {
    it('保存审计条目并写入 prevHash + hash', async () => {
      chain.computeHash.mockReturnValue('computed-hash');
      await service.log({ userId: '1', action: 'chat', provider: 'deepseek' });
      expect(chain.computeHash).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ userId: '1', action: 'chat', provider: 'deepseek' }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ prevHash: null, hash: 'computed-hash' }),
      );
    });

    it('取到上一条 hash 后串接', async () => {
      (repo.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ hash: 'prev-hash' }),
      });
      await service.log({ userId: '1', action: 'chat' });
      expect(chain.computeHash).toHaveBeenCalledWith('prev-hash', expect.anything());
    });

    it('verifyChain 沿 id 升序取数并委托链校验', async () => {
      repo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      await service.verifyChain();
      expect(repo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
      expect(chain.verifyChain).toHaveBeenCalled();
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
