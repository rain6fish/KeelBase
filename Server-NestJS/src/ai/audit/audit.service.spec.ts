// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { AuditService } from './audit.service';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { AuthorizationExplainerService } from '../authorization-explainer.service';
import { actorContext } from '../actor-context';

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

  // DB 级串行（roadmap §22.10 B）：log() 用 DataSource runner 事务 + 锁行，spec 需 mock runner
  let runner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    manager: { save: jest.Mock };
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let dataSource: { options: { type: string }; createQueryRunner: jest.Mock };

  beforeEach(async () => {
    repo = makeLogRepo();
    usageRepo = makeUsageRepo();
    effectsRepo = makeEffectsRepo();
    chain = {
      computeHash: jest.fn().mockReturnValue('hash-1'),
      verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 0 }),
    };
    const saved: Array<Record<string, unknown>> = [];
    runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]), // 锁行 + _lastHash 默认返回空（首条 hash null）
      manager: {
        save: jest.fn((_e: unknown, o: Record<string, unknown>) => {
          saved.push(o);
          return Promise.resolve(o);
        }),
      },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      options: { type: 'postgres' }, // 测 DB 级串行锁路径（roadmap §22.10 B）；sqlite 走 _tail（单写者）
      createQueryRunner: jest.fn().mockReturnValue(runner),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AiAuditLog), useValue: repo },
        { provide: getRepositoryToken(AiDailyUsage), useValue: usageRepo },
        { provide: getRepositoryToken(AiToolSideEffect), useValue: effectsRepo },
        { provide: AuditChainService, useValue: chain },
        { provide: DataSource, useValue: dataSource },
        // §22.16 A-5 放行快照：authorizationExplainer 供「无快照降级重算」场景（快照场景不应调用）
        {
          provide: AuthorizationExplainerService,
          useValue: {
            explainAuthorization: jest.fn().mockResolvedValue({
              tool: 'query_customers',
              checks: [{ name: 'RECOMPUTED', ok: true }],
            }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
    (service as any).__saved = saved;
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
    it('从 ActorContext 读 sessionId/agentId 接线（Agent Identity）', async () => {
      await actorContext.run({ sessionId: 'sess-1', agentId: 'key-legacy-erp' }, () =>
        service.log({ userId: '1', action: 'chat' }),
      );
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({ sessionId: 'sess-1', agentId: 'key-legacy-erp' }),
      );
    });

    it('D4 从 ActorContext fallback callerAgentId/businessIntent（子 agent 场景自动归责）', async () => {
      await actorContext.run(
        { agentId: 'research-agent', callerAgentId: 'orchestrator', businessIntent: 'sub-agent' },
        () => service.log({ userId: '1', action: 'tool_call' }),
      );
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({
          agentId: 'research-agent',
          callerAgentId: 'orchestrator',
          businessIntent: 'sub-agent',
        }),
      );
    });

    it('D4 委托链字段填充（parentActionId/callerAgentId/businessIntent/source）', async () => {
      await service.log({
        userId: '1',
        action: 'tool_call',
        parentActionId: 'action-9',
        callerAgentId: 'sub-agent-2',
        delegationContext: '{"from":"orchestrator"}',
        businessIntent: '跟进高风险客户',
        source: 'headless',
      });
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({
          parentActionId: 'action-9',
          callerAgentId: 'sub-agent-2',
          delegationContext: '{"from":"orchestrator"}',
          businessIntent: '跟进高风险客户',
          source: 'headless',
        }),
      );
    });

    it('log 走 DB 级串行锁事务（锁 audit_chain_lock + 事务内保存，roadmap §22.10 B）', async () => {
      // DB 级串行：每次 log 事务内锁行 → 读 lastHash → 保存；跨实例分叉 0 由压测脚本 --instances 验证
      await Promise.all(
        Array.from({ length: 5 }, () =>
          service.log({ userId: '1', conversationId: 'c', action: 'chat', isError: false }),
        ),
      );

      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(5);
      expect(runner.startTransaction).toHaveBeenCalledTimes(5);
      expect(runner.commitTransaction).toHaveBeenCalledTimes(5);
      expect(runner.manager.save).toHaveBeenCalledTimes(5);
      // 锁行查询被调用（postgres SELECT FOR UPDATE）
      expect(runner.query).toHaveBeenCalledWith('SELECT id FROM "audit_chain_lock" WHERE id = 1 FOR UPDATE');
      // 每条都走了 _lastHash 查询（SELECT FROM ai_audit_logs）
      expect(runner.query.mock.calls.some((c) => String(c[0]).includes('FROM "ai_audit_logs"'))).toBe(true);
    });

    it('保存审计条目并写入 prevHash + hash', async () => {
      chain.computeHash.mockReturnValue('computed-hash');
      await service.log({ userId: '1', action: 'chat', provider: 'deepseek' });
      expect(chain.computeHash).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ userId: '1', action: 'chat', provider: 'deepseek' }),
      );
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({ prevHash: null, hash: 'computed-hash' }),
      );
    });

    it('取到上一条 hash 后串接（runner.query 在锁事务内读）', async () => {
      runner.query.mockImplementation((sql: string) =>
        String(sql).includes('FROM "ai_audit_logs"')
          ? Promise.resolve([{ hash: 'prev-hash' }])
          : Promise.resolve([]),
      );
      await service.log({ userId: '1', action: 'chat' });
      expect(chain.computeHash).toHaveBeenCalledWith('prev-hash', expect.anything());
    });

    it('verifyChain 沿 id 升序取数并委托链校验', async () => {
      repo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      await service.verifyChain();
      expect(repo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
      expect(chain.verifyChain).toHaveBeenCalled();
    });

    it('E-2：valid 链返回最近 24 条切片', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, prevHash: i === 0 ? null : `h${i}`, hash: `h${i + 1}`,
        createdAt: new Date(), action: 'chat', detail: null, isError: false,
      }));
      repo.find.mockResolvedValue(rows);
      (chain.verifyChain as jest.Mock).mockReturnValue({ valid: true, checked: 30 });
      const result = await service.verifyChain();
      expect(result.chain).toHaveLength(24);
      expect(result.chain[0].id).toBe(7); // 30-24+1
      expect(result.chain[23].id).toBe(30);
      expect(result.chain.every((n) => !n.broken)).toBe(true);
    });

    it('E-2：broken 链以断点为中心切片并标记断点行', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, prevHash: i === 0 ? null : `h${i}`, hash: `h${i + 1}`,
        createdAt: new Date(), action: 'tool_call', detail: 'query_customers({})', isError: false,
      }));
      repo.find.mockResolvedValue(rows);
      (chain.verifyChain as jest.Mock).mockReturnValue({ valid: false, checked: 10, brokenIndex: 11 });
      const result = await service.verifyChain();
      expect(result.chain.length).toBeLessThan(30); // 断点窗口而非全量
      const brokenNode = result.chain.find((n) => n.broken);
      expect(brokenNode).toBeDefined();
      expect(brokenNode!.id).toBe(11);
      expect(brokenNode!.toolName).toBe('query_customers');
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

    it('§22.16 A-1：business_event/evidence 不入哈希 payload（链外，_payload 恒 null）', async () => {
      repo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      let payloadFor: ((row: Record<string, unknown>) => Record<string, unknown>) | undefined;
      (chain.verifyChain as jest.Mock).mockImplementation((_rows, cb) => {
        payloadFor = cb;
        return { valid: true, checked: 1 };
      });
      await service.verifyChain();
      const payload = payloadFor!({
        id: 1,
        prevHash: null,
        hash: 'a',
        businessEvent: 'CustomerRiskAssessed',
        evidence: '{"decision":"high"}',
      });
      expect(payload.businessEvent).toBeNull();
      expect(payload.evidence).toBeNull();
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

    it('E-2：getLogs isError 过滤加 andWhere 条件', async () => {
      const qb = mockQueryBuilder();
      await service.getLogs({ isError: 'true' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('log.is_error'),
        expect.objectContaining({ isError: true }),
      );
    });

    it('A-8：getLogs denied 过滤（越权/阻断 = is_error true + authorization 非空）', async () => {
      const qb = mockQueryBuilder();
      await service.getLogs({ denied: 'true' });
      expect(qb.andWhere).toHaveBeenCalledWith('log.is_error = :deniedIsErr', { deniedIsErr: true });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "log.authorization IS NOT NULL AND log.authorization <> ''",
      );
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
      { action: 'chat', promptTokens: 100, completionTokens: 50, isError: false, createdAt: new Date('2026-08-30T01:00:00Z') },
      { action: 'tool_call', promptTokens: 10, completionTokens: 5, isError: false, createdAt: new Date('2026-08-30T02:00:00Z') },
      { action: 'chat', promptTokens: 30, completionTokens: 10, isError: true, createdAt: new Date('2026-08-30T03:00:00Z') },
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
      expect(repo.find).toHaveBeenCalledWith({ where: {}, select: expect.objectContaining({ action: true }) });
    });

    it('E-2：getAllStats 返回 byDay 趋势（含 errors/blocked 段）', async () => {
      repo.find.mockResolvedValue([
        { action: 'tool_call', detail: 'query_customers({})', isError: false, createdAt: new Date('2026-08-30T10:00:00Z') },
        { action: 'tool_call', detail: 'create_followup_task({})', isError: false, createdAt: new Date('2026-08-30T11:00:00Z') },
        { action: 'tool_call', detail: 'query_evil({})', isError: true, errorMessage: 'blocked (risk level R5)', createdAt: new Date('2026-08-30T12:00:00Z') },
      ]);
      const result = await service.getAllStats();
      expect(result.byDay).toHaveLength(1);
      expect(result.byDay[0]).toMatchObject({ date: '2026-08-30', executed: 2, approved: 0, rejected: 0, blocked: 1, errors: 1 });
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
      // B3：同日日志聚合到单个 byDay 桶（计数与 summary 对齐）
      expect(report.byDay).toHaveLength(1);
      expect(report.byDay[0]).toMatchObject({ executed: 1, approved: 1, rejected: 1, blocked: 1, errors: 2 });
    });

    it('byDay 按 UTC 日聚合（多日升序，阻断/错误分别入桶）', async () => {
      repo.find.mockResolvedValue([
        { id: 1, userId: '1', action: 'tool_call', detail: 'create_x()', isError: false, createdAt: new Date('2026-08-20T10:00:00Z') },
        { id: 2, userId: '1', action: 'tool_call', detail: 'query_y({})', isError: true, errorMessage: 'blocked (risk level R5)', createdAt: new Date('2026-08-20T11:00:00Z') },
        { id: 3, userId: '1', action: 'tool_call', detail: 'create_z()', isError: false, createdAt: new Date('2026-08-21T09:00:00Z') },
      ]);
      effectsRepo.count.mockResolvedValue(0);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 3 });

      const report = await service.getActionReport();

      expect(report.byDay).toEqual([
        { date: '2026-08-20', executed: 1, approved: 0, rejected: 0, blocked: 1, errors: 1 },
        { date: '2026-08-21', executed: 1, approved: 0, rejected: 0, blocked: 0, errors: 0 },
      ]);
    });

    it('无日志时全零 + 哈希链 checked 0', async () => {
      repo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(0);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport();
      expect(report.summary.executed).toBe(0);
      expect(report.hashChain).toEqual({ valid: true, checked: 0, brokenIndex: null });
      expect(report.samples).toEqual([]);
      expect(report.byDay).toEqual([]);
    });

    it('E-1：effectDiffs 解析副作用 before/after 快照', async () => {
      repo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(1);
      effectsRepo.find.mockResolvedValue([
        {
          id: 7,
          toolName: 'create_followup_task',
          resultType: 'crm_task',
          resultId: 3,
          createdAt: new Date('2026-08-30T00:00:00Z'),
          beforeSnapshot: null,
          afterSnapshot: '{"id":3,"title":"跟进","status":"open"}',
        },
      ]);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport({ userId: '1' });
      expect(report.effectDiffs).toHaveLength(1);
      expect(report.effectDiffs[0]).toMatchObject({
        resultType: 'crm_task',
        before: null,
        after: { id: 3, title: '跟进', status: 'open' },
      });
    });

    it('E-1：快照非法 JSON 降级 null（不破坏证据包）', async () => {
      repo.find.mockResolvedValue([]);
      effectsRepo.count.mockResolvedValue(1);
      effectsRepo.find.mockResolvedValue([
        { id: 8, toolName: 'create_todo', resultType: 'todo', resultId: 1, createdAt: new Date(), beforeSnapshot: 'not-json', afterSnapshot: null },
      ]);
      chain.verifyChain.mockReturnValue({ valid: true, checked: 0 });

      const report = await service.getActionReport();
      expect(report.effectDiffs[0]).toMatchObject({ before: null, after: null });
    });
  });

  describe('getLogs agentId 过滤（Agent Registry → 审计联动）', () => {
    it('按 log.agent_id 过滤并返回 agentId 字段', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            log_id: 1,
            log_user_id: '1',
            log_conversation_id: null,
            log_action: 'tool_call',
            log_detail: 'create_todo({})',
            log_agent_id: 'sales-agent',
            log_parent_action_id: null,
            log_caller_agent_id: null,
            log_delegation_context: null,
            log_business_intent: null,
            log_source: null,
            log_model: 'm',
            log_provider: 'p',
            log_prompt_tokens: 1,
            log_completion_tokens: 1,
            log_duration_ms: 1,
            log_is_error: 0,
            log_error_message: null,
            log_authorization: null,
            log_feedback: null,
            log_feedback_note: null,
            log_createdAt: '2026-08-26T00:00:00Z',
            username: 'alex',
          },
        ]),
      };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const rows = await service.getLogs({ agentId: 'sales-agent' });

      expect(qb.andWhere).toHaveBeenCalledWith('log.agent_id = :agentId', { agentId: 'sales-agent' });
      expect(rows[0].agentId).toBe('sales-agent');
      expect(rows[0].actionLabel).toBeDefined();
    });
  });

  describe('getActionReportExport（D4/A2 证据包：format + chain + 签名）', () => {
    it('导出含 format / 全量 chain（payload 供离线重算）/ 签名覆盖 chain', async () => {
      (service as any).getActionReport = jest.fn().mockResolvedValue({
        summary: { totalCalls: 1 },
        hashChain: { valid: true, checked: 2, brokenIndex: null },
        effectDiffs: [],
      });
      const prevKey = process.env.AUDIT_HMAC_KEY;
      process.env.AUDIT_HMAC_KEY = 'ab'.repeat(32);
      try {
        repo.find.mockResolvedValue([
          { id: 1, userId: '42', conversationId: null, action: 'tool_call', detail: 'query_customers({})', model: 'deepseek-v4-flash', provider: 'deepseek', promptTokens: 10, completionTokens: 5, durationMs: 100, isError: false, errorMessage: null, authorization: null, prevHash: null, hash: 'a'.repeat(64) },
          { id: 2, userId: '42', conversationId: null, action: 'chat', detail: 'hello', model: null, provider: null, promptTokens: null, completionTokens: null, durationMs: null, isError: false, errorMessage: null, authorization: null, prevHash: 'a'.repeat(64), hash: 'b'.repeat(64) },
        ]);
        const out = await service.getActionReportExport({});
        expect(out.format).toBe('keelbase-audit-evidence/2');
        expect(out.generator).toBe('keelbase-audit-export');
        expect(out.compliance).toEqual([]); // mock report 无 samples → 空合规段
        expect(out.chain).toHaveLength(2);
        expect(out.chain[0]).toMatchObject({ seq: 1, id: 1, prevHash: null, hash: 'a'.repeat(64) });
        expect(out.chain[1].seq).toBe(2);
        expect(out.chain[1].prevHash).toBe('a'.repeat(64));
        // payload 与写入侧一致（feedback/businessEvent 恒 null，供离线重算）
        expect(out.chain[0].payload).toMatchObject({ userId: '42', action: 'tool_call', completionTokens: 5, feedback: null, businessEvent: null, evidence: null });
        expect(out.signature).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        if (prevKey === undefined) delete process.env.AUDIT_HMAC_KEY;
        else process.env.AUDIT_HMAC_KEY = prevKey;
      }
    });

    it('§22.16 A-6 合规段：samples 业务摘要 + 责任链（签名覆盖 compliance）', async () => {
      (service as any).getActionReport = jest.fn().mockResolvedValue({
        summary: { executed: 1 },
        hashChain: { valid: true, checked: 1, brokenIndex: null },
        effectDiffs: [],
        samples: [{ id: 1, action: 'tool_call', toolName: 'analyze_customer_risk', isError: false, createdAt: new Date() }],
      });
      const prevKey = process.env.AUDIT_HMAC_KEY;
      process.env.AUDIT_HMAC_KEY = 'ab'.repeat(32);
      try {
        repo.find.mockResolvedValue([
          { id: 1, userId: '42', username: 'alex', conversationId: 'c1', action: 'tool_call', detail: 'analyze_customer_risk({"id":7})', businessEvent: 'CustomerRiskAssessed', evidence: '{"decision":"high","evidence":["订单降42%"]}', agentId: 'key-a', prevHash: null, hash: 'a'.repeat(64) },
          { id: 2, userId: '42', username: 'alex', conversationId: 'c1', action: 'chat', detail: 'hi', prevHash: 'a'.repeat(64), hash: 'b'.repeat(64) },
        ]);
        const out = await service.getActionReportExport({});
        expect(out.compliance).toHaveLength(1);
        expect(out.compliance[0].summary.sentence).toContain('alex');
        expect(out.compliance[0].summary.sentence).toContain('high');
        expect(out.compliance[0].businessEvent).toBe('CustomerRiskAssessed');
        expect(out.compliance[0].identityChain.human.username).toBe('alex');
        expect(out.compliance[0].identityChain.tool.toolName).toBe('analyze_customer_risk');
      } finally {
        if (prevKey === undefined) delete process.env.AUDIT_HMAC_KEY;
        else process.env.AUDIT_HMAC_KEY = prevKey;
      }
    });
  });

  describe('getChain（§22.16 A-5 跨系统身份链）', () => {
    it('聚合 Human→Intent→Agent→Tool→Action + 会话工具序列 + source', async () => {
      repo.findOne.mockResolvedValue({
        id: 1, userId: '42', username: 'bob', action: 'tool_call',
        detail: 'create_followup_task({"customerId":7})',
        businessEvent: 'FollowupTaskCreated', agentId: 'key-legacy-erp', callerAgentId: 'research',
        businessIntent: '跟进高风险客户', source: 'bridge',
        conversationId: 'c1', createdAt: new Date(),
      });
      repo.find.mockResolvedValue([
        { id: 1, action: 'tool_call', detail: 'create_followup_task({})', businessEvent: 'FollowupTaskCreated', agentId: 'key-legacy-erp', createdAt: new Date() },
      ]);
      const res = await service.getChain(1);
      expect(res.human.username).toBe('bob');
      expect(res.agent.agentId).toBe('key-legacy-erp');
      expect(res.agent.callerAgentId).toBe('research');
      expect(res.intent).toBe('跟进高风险客户');
      expect(res.source).toBe('bridge');
      expect(res.tool.toolName).toBe('create_followup_task');
      expect(res.action.businessEvent).toBe('FollowupTaskCreated');
      expect(res.chain).toHaveLength(1);
    });

    it('拒绝场景：解析 authorization checks 为授权依据', async () => {
      repo.findOne.mockResolvedValue({
        id: 2, userId: '42', action: 'tool_call', detail: 'query_evil({})',
        authorization: JSON.stringify([{ name: 'risk_policy', ok: false, note: 'R5 阻断' }]),
        createdAt: new Date(),
      });
      repo.find.mockResolvedValue([]);
      const res = await service.getChain(2);
      expect(res.authorization.denied).toEqual([{ name: 'risk_policy', ok: false, note: 'R5 阻断' }]);
      expect(res.authorization.allowed).toBeNull();
    });

    it('放行快照优先：allowed 用事件时点快照（不重算当前策略）', async () => {
      const snapshotChecks = [{ name: 'user_scoped', ok: true, note: '仅本人数据' }];
      repo.findOne.mockResolvedValue({
        id: 3, userId: '42', action: 'tool_call', detail: 'query_customers({})',
        authorization: JSON.stringify({ allowed: true, tool: 'query_customers', riskLevel: 'R1', strategy: 'auto', checks: snapshotChecks }),
        createdAt: new Date(),
      });
      repo.find.mockResolvedValue([]);
      const res = await service.getChain(3);
      expect(res.authorization.denied).toBeNull();
      // allowed 取快照 checks（而非 aiService.explainAuthorization 的 RECOMPUTED）→ 证明快照优先、未重算
      expect(res.authorization.allowed).toEqual({ checks: snapshotChecks, riskLevel: 'R1' });
    });

    it('历史数据无放行快照 → 降级当前策略重算（向后兼容）', async () => {
      repo.findOne.mockResolvedValue({
        id: 4, userId: '42', action: 'tool_call', detail: 'query_customers({})', authorization: null,
        createdAt: new Date(),
      });
      repo.find.mockResolvedValue([]);
      const res = await service.getChain(4);
      expect(res.authorization.denied).toBeNull();
      expect(res.authorization.allowed).toEqual({
        tool: 'query_customers',
        checks: [{ name: 'RECOMPUTED', ok: true }],
      });
    });
  });
});
