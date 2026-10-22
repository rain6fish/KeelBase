// SPDX-License-Identifier: Apache-2.0

/**
 * AuditQueryService（审计日志查询）单元测试。
 *
 * 用例从 `audit.service.spec` **整段搬来、断言一字未改**——拆分的纪律是「行为不变」，
 * 而这些断言就是那条护栏；搬的时候顺手改断言，等于先把护栏拆了再拆房子。
 */
import { AuditQueryService } from './audit-query.service';
import { UserRole } from '../../common/entities/user.entity';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AuditQueryService（从 AuditService 拆出的查询域）', () => {
  let repo: { createQueryBuilder: jest.Mock; update: jest.Mock };
  let service: AuditQueryService;

  beforeEach(() => {
    repo = { createQueryBuilder: jest.fn(), update: jest.fn().mockResolvedValue({ affected: 1 }) };
    service = new AuditQueryService(repo as never);
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

    /** 链式 QueryBuilder 替身（与原 spec 逐字相同——搬迁不改夹具，否则测的就不是同一件事） */
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

    it('PC-2：getLogs 运行时行键集 == ai-audit-log-row 冻结契约（版本按 registry 解析）', async () => {
      mockQueryBuilder();
      const result = await service.getLogs({ limit: 20 });
      // 版本**按 registry 声明**解析，不硬写 —— 硬写的代价是升版即静默失配：
      // 本轮 `ai-audit-log-row` 出 v4（加 deviceId）时，硬写 v3 的那版断言失败信息指向的是
      // 一个已经过时的路径，看不出「契约升版了、绑定该跟上去」（`capabilities` 那边当年同款教训）。
      const registry = JSON.parse(
        readFileSync(resolve(__dirname, '../../../specs/protocol/wire-schema-registry-v2.json'), 'utf8'),
      ) as { objects: Array<{ id: string; version: string; schema: string }> };
      const entry = registry.objects.find((o) => o.id === 'ai-audit-log-row');
      expect(entry).toBeDefined();
      // v2 writes `schema` one way — the bare file name, with the version beside it — so the path is
      // built rather than guessed, and there is only one shape to know.
      // v2 的 `schema` **只有一种写法**（裸名，版本在旁边），故路径是**拼出来的**、不是猜的，也只有一种形状要认。
      const schema = JSON.parse(
        readFileSync(resolve(__dirname, `../../../specs/protocol/schemas/${entry!.version}/${entry!.schema}`), 'utf8'),
      ) as { properties: Record<string, unknown> };
      expect(Object.keys(result[0]).sort()).toEqual(Object.keys(schema.properties).sort());
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

  /**
   * AW-2 的「组织 / 期间范围」。这里钉的是**查询被施加了什么约束**；真实的行级读数是
   * `test/audit-reader-scope.e2e-spec.ts`（真 DI + 真库），因为「越界看不到」不是替身能证明的事。
   *
   * What the query is constrained by is pinned here; the actual row-level reading is the e2e suite,
   * because a double cannot prove "a row outside the scope is not visible".
   */
  describe('AW-2 审计读者的组织 / 期间范围', () => {
    function mockQb() {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('审计读者属于某组织 → 追加本人所属组织的成员子查询', async () => {
      const qb = mockQb();
      const org = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 7, deptId: null }) };
      const scoped = new AuditQueryService(repo as never, org as never);

      await scoped.getLogs({}, { userId: 5, role: UserRole.AUDITOR });

      expect(org.getUserOrgContext).toHaveBeenCalledWith(5);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :readerOrgId)',
        { readerOrgId: 7 },
      );
    });

    it('审计读者不属于任何组织 → 退回本人行（只收紧，不放宽）', async () => {
      const qb = mockQb();
      const org = { getUserOrgContext: jest.fn().mockResolvedValue(null) };
      const scoped = new AuditQueryService(repo as never, org as never);

      await scoped.getLogs({}, { userId: 5, role: UserRole.AUDITOR });

      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :readerUserId', { readerUserId: '5' });
    });

    it('组织查询失败同样退回本人行，而不是不加约束', async () => {
      const qb = mockQb();
      const org = { getUserOrgContext: jest.fn().mockRejectedValue(new Error('db down')) };
      const scoped = new AuditQueryService(repo as never, org as never);

      await scoped.getLogs({}, { userId: 5, role: UserRole.AUDITOR });

      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :readerUserId', { readerUserId: '5' });
    });

    it('请求里的 orgId 与账号范围是 AND：审计读者无法用参数放宽账号组织', async () => {
      const qb = mockQb();
      const org = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 7, deptId: null }) };
      const scoped = new AuditQueryService(repo as never, org as never);

      await scoped.getLogs({ orgId: 99 }, { userId: 5, role: UserRole.AUDITOR });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :orgId)',
        { orgId: 99 },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :readerOrgId)',
        { readerOrgId: 7 },
      );
    });

    it('管理员不加行范围约束（行为不变）', async () => {
      const qb = mockQb();
      const org = { getUserOrgContext: jest.fn() };
      const scoped = new AuditQueryService(repo as never, org as never);

      await scoped.getLogs({}, { userId: 1, role: UserRole.ADMIN });

      expect(org.getUserOrgContext).not.toHaveBeenCalled();
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('org_members WHERE org_id = :readerOrgId'),
        expect.anything(),
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith('log.userId = :readerUserId', expect.anything());
    });

    it('期间两端闭合：since 与 until 都进查询', async () => {
      const qb = mockQb();

      await service.getLogs({
        since: new Date('2026-08-01T00:00:00Z'),
        until: new Date('2026-08-31T23:59:59Z'),
      });

      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :since', {
        since: new Date('2026-08-01T00:00:00Z'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt <= :until', {
        until: new Date('2026-08-31T23:59:59Z'),
      });
    });
  });
});
