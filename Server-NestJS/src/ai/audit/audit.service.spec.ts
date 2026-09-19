// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { AuditService } from './audit.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { AuthorizationExplainerService } from '../authorization-explainer.service';
import { actorContext } from '../actor-context';
import { requestContext } from '../../common/request-context';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  // DB 级串行（internal-roadmap §internal.10 B）：log() 用 DataSource runner 事务 + 锁行，spec 需 mock runner
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
      options: { type: 'postgres' }, // 测 DB 级串行锁路径（internal-roadmap §internal.10 B）；sqlite 走 _tail（单写者）
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
        // §internal.16 A-5 放行快照：authorizationExplainer 供「无快照降级重算」场景（快照场景不应调用）
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

    it('AU-6：从 ActorContext fallback source（各入口自动归因；entry 显式传值优先）', async () => {
      // actor 提供 source → 落库（此前 source 无写入方 → 0/316）
      await actorContext.run({ source: 'web' }, () => service.log({ userId: '1', action: 'chat' }));
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({ source: 'web' }),
      );
      // entry 显式 source 优先于 actor（B 路径 bridge 更具体）
      await actorContext.run({ source: 'web' }, () =>
        service.log({ userId: '1', action: 'tool_call', source: 'bridge' }),
      );
      expect(runner.manager.save).toHaveBeenLastCalledWith(AiAuditLog,
        expect.objectContaining({ source: 'bridge' }),
      );
    });

    it('AU-2：从 requestContext 填 ip（客户端来源；链外列）', async () => {
      await requestContext.run({ ip: '203.0.113.7' }, () =>
        service.log({ userId: '1', action: 'chat' }),
      );
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({ ip: '203.0.113.7' }),
      );
      // 无 requestContext（如测试/后台任务）→ ip undefined（不抛）
      await service.log({ userId: '1', action: 'chat' });
      expect(runner.manager.save).toHaveBeenLastCalledWith(AiAuditLog,
        expect.objectContaining({ ip: undefined }),
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

    it('log 走 DB 级串行锁事务（锁 audit_chain_lock + 事务内保存，internal-roadmap §internal.10 B）', async () => {
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

    it('G-2：v2 行链 payload 含链外归责/业务注解列真实值 + payloadVersion=2', async () => {
      chain.computeHash.mockReturnValue('v2-hash');
      await service.log({
        userId: '42',
        action: 'tool_call',
        detail: 'create_followup_task({"customerId":7})',
        conversationId: 'c1',
        agentId: 'agent-1',
        sessionId: 'sess-1',
        parentActionId: '38171',
        callerAgentId: 'research',
        businessIntent: '跟进高风险客户',
        source: 'bridge',
        businessEvent: 'FollowupTaskCreated',
        evidence: JSON.stringify({ decision: 'create', evidence: [], policy: 'p' }),
        isError: false,
      });
      const payload = chain.computeHash.mock.calls[0][1] as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          businessEvent: 'FollowupTaskCreated',
          evidence: expect.any(String),
          agentId: 'agent-1',
          sessionId: 'sess-1',
          parentActionId: '38171',
          callerAgentId: 'research',
          businessIntent: '跟进高风险客户',
          source: 'bridge',
        }),
      );
      expect(runner.manager.save).toHaveBeenCalledWith(AiAuditLog,
        expect.objectContaining({ payloadVersion: 2, hash: 'v2-hash' }),
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

  });


});
