import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
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
    update: jest.fn(async () => ({ affected: 1, raw: {} })),
  };
}

function makeEffectsRepo() {
  return { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) };
}

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof makeLogRepo>;
  let usageRepo: ReturnType<typeof makeUsageRepo>;
  let effectsRepo: ReturnType<typeof makeEffectsRepo>;
  let chain: jest.Mocked<Pick<AuditChainService, 'computeHash' | 'verifyChain'>>;

  beforeEach(async () => {
    repo = makeLogRepo();
    usageRepo = makeUsageRepo();
    effectsRepo = makeEffectsRepo();
    chain = {
      computeHash: jest.fn().mockReturnValue('hash-1'),
      verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AiAuditLog), useValue: repo },
        { provide: getRepositoryToken(AiDailyUsage), useValue: usageRepo },
        { provide: getRepositoryToken(AiToolSideEffect), useValue: effectsRepo },
        { provide: AuditChainService, useValue: chain },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
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

  describe('log（HS-11 哈希链）', () => {
    it('并发写不产生链分叉（串行队列，合成陌生人实测发现 brokenIndex）', async () => {
      // 模拟 DB 语义：_lastHash 读当前最新 hash，save 追加；无串行队列时并发会读到同一 lastHash 分叉
      (service as any)._tail = Promise.resolve();
      const stored: Array<{ prevHash: string | null; hash: string }> = [];
      let seq = 0;
      (repo.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockImplementation(async () =>
          stored.length ? { hash: stored[stored.length - 1].hash } : null,
        ),
      });
      repo.save.mockImplementation(async (e: any) => {
        seq += 1;
        const record = { ...e, hash: `h-${seq}` };
        stored.push(record);
        return record;
      });

      await Promise.all(
        Array.from({ length: 5 }, () =>
          service.log({ userId: '1', conversationId: 'c', action: 'chat', isError: false }),
        ),
      );

      expect(stored).toHaveLength(5);
      // 串行队列保证：每条 prevHash = 前一条 hash（无分叉）；首条 prevHash = null
      expect(stored[0].prevHash).toBeNull();
      for (let i = 1; i < stored.length; i++) {
        expect(stored[i].prevHash).toBe(stored[i - 1].hash);
      }
    });

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

    it('feedback 后置写入不参与哈希 payload（submitFeedback 不断链，HS-11）', async () => {
      repo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      let payloadFor: ((row: Record<string, unknown>) => Record<string, unknown>) | undefined;
      (chain.verifyChain as jest.Mock).mockImplementation((_rows, cb) => {
        payloadFor = cb;
        return { valid: true, checked: 1 };
      });
      await service.verifyChain();
      // 即使行里已写入 feedback（submitFeedback 后置更新），payload 仍恒为 null —— 与写入时 canonical 一致
      const payload = payloadFor!({
        id: 1,
        prevHash: null,
        hash: 'a',
        feedback: 'thumbs_down',
        feedbackNote: '回答不准',
      });
      expect(payload.feedback).toBeNull();
      expect(payload.feedbackNote).toBeNull();
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

  describe('getLogs / getUserLogs（左联用户表带出 username）', () => {
    const rawRow = {
      log_id: 7,
      log_user_id: '5',
      log_conversation_id: 'conv-1',
      log_action: 'chat',
      log_detail: 'd',
      log_model: 'deepseek',
      log_provider: 'deepseek',
      log_prompt_tokens: '100',
      log_completion_tokens: '50',
      log_duration_ms: '200',
      log_is_error: 0,
      log_error_message: null,
      log_feedback: null,
      log_feedback_note: null,
      log_createdAt: '2026-08-15T00:00:00.000Z',
      username: 'alice',
    };

    function mockQueryBuilder() {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([rawRow]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('getLogs 全量查询并映射字段（含 username）', async () => {
      const qb = mockQueryBuilder();
      const result = await service.getLogs({ limit: 20, offset: 5 });
      expect(result[0]).toMatchObject({
        id: 7, userId: '5', action: 'chat', username: 'alice',
        promptTokens: 100, completionTokens: 50, durationMs: 200,
      });
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(5);
    });

    it('getLogs 带 since/feedback 追加 andWhere', async () => {
      const qb = mockQueryBuilder();
      await service.getLogs({ since: new Date('2026-08-01'), feedback: 'thumbs_down' });
      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :since', { since: new Date('2026-08-01') });
      expect(qb.andWhere).toHaveBeenCalledWith('log.feedback = :feedback', { feedback: 'thumbs_down' });
    });

    it('getUserLogs 按 userId 过滤', async () => {
      const qb = mockQueryBuilder();
      await service.getUserLogs('42', { limit: 10 });
      expect(qb.where).toHaveBeenCalledWith('log.userId = :userId', { userId: '42' });
    });

    it('getLogs 按组织维度过滤（ORG-5）', async () => {
      const qb = mockQueryBuilder();
      await service.getLogs({ orgId: 3 });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :orgId)',
        { orgId: 3 },
      );
    });
  });

  describe('getStats / getAllStats', () => {
    const logs = [
      { action: 'chat', promptTokens: 100, completionTokens: 50, isError: false },
      { action: 'tool_call', promptTokens: 10, completionTokens: 5, isError: false },
      { action: 'chat', promptTokens: 30, completionTokens: 10, isError: true },
    ];

    it('getStats 聚合 token/错误/动作分布并按次数排序', async () => {
      repo.find.mockResolvedValue(logs);
      const result = await service.getStats('1', new Date('2026-08-01'));
      expect(result.totalConversations).toBe(2);
      expect(result.totalMessages).toBe(3);
      expect(result.totalTokens).toBe(205);
      expect(result.totalErrors).toBe(1);
      expect(result.topActions[0]).toEqual({ action: 'chat', count: 2 });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: '1', createdAt: expect.anything() }) }),
      );
    });

    it('getStats 无 since 不设时间过滤', async () => {
      repo.find.mockResolvedValue([]);
      await service.getStats('1');
      expect(repo.find).toHaveBeenCalledWith({ where: { userId: '1' } });
    });

    it('getAllStats 全量聚合（无 userId）', async () => {
      repo.find.mockResolvedValue(logs);
      const result = await service.getAllStats();
      expect(result.totalMessages).toBe(3);
      expect(result.totalErrors).toBe(1);
      expect(repo.find).toHaveBeenCalledWith({ where: {} });
    });

    it('getAllStats 带 since 过滤', async () => {
      repo.find.mockResolvedValue([]);
      await service.getAllStats(new Date('2026-08-01'));
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) }),
      );
    });
  });

  describe('getActionReport（§10 P1 合规证据包）', () => {
    it('聚合 执行/批准/拒绝/阻断 + 副作用 + 哈希链', async () => {
      repo.find.mockResolvedValue([
        { id: 1, userId: '1', action: 'tool_call', detail: 'create_followup_task({"customerId":1})', isError: false, createdAt: new Date() },
        { id: 2, userId: '1', action: 'tool_confirmation', detail: 'create_followup_task() → approve', isError: false, createdAt: new Date() },
        { id: 3, userId: '1', action: 'tool_confirmation', detail: 'x() → decline', isError: true, errorMessage: 'User declined the operation', createdAt: new Date() },
        { id: 4, userId: '1', action: 'tool_call', detail: 'query_customers({})', isError: true, errorMessage: 'Tool "query_evil" is blocked (risk level R5)', createdAt: new Date() },
      ]);
      effectsRepo.count.mockResolvedValue(2);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 4 });

      const report = await service.getActionReport({ userId: '1' });

      expect(report.summary).toEqual({
        executed: 1,
        approved: 1,
        rejected: 1,
        blocked: 1,
        errors: 2,
        effects: 2,
      });
      expect(report.hashChain).toEqual({ valid: true, checked: 4, brokenIndex: null });
      // 明细样本：从 detail 提取工具名 + 阻断原因可见
      expect(report.samples[0].toolName).toBe('create_followup_task');
      expect(report.samples[3].toolName).toBe('query_customers');
      expect(report.samples[3].errorMessage).toContain('blocked (risk level R5)');
    });

    it('无日志时全零 + 哈希链 checked 0', async () => {
      repo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(0);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport();
      expect(report.summary.executed).toBe(0);
      expect(report.hashChain).toEqual({ valid: true, checked: 0, brokenIndex: null });
      expect(report.samples).toEqual([]);
    });
  });
});
