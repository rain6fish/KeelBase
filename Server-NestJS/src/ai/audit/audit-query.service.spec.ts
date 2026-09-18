// SPDX-License-Identifier: Apache-2.0

/**
 * AuditQueryService（审计日志查询）单元测试。
 *
 * 用例从 `audit.service.spec` **整段搬来、断言一字未改**——拆分的纪律是「行为不变」，
 * 而这些断言就是那条护栏；搬的时候顺手改断言，等于先把护栏拆了再拆房子。
 */
import { AuditQueryService } from './audit-query.service';
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

    it('PC-2：getLogs 运行时行键集 == ai-audit-log-row 冻结契约（v3：含 ip + guestId）', async () => {
      mockQueryBuilder();
      const result = await service.getLogs({ limit: 20 });
      const schema = JSON.parse(
        readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v3/ai-audit-log-row.schema.json'), 'utf8'),
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
});
