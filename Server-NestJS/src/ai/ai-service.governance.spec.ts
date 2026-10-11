// SPDX-License-Identifier: Apache-2.0


import { AuthorizationExplainerService } from './authorization-explainer.service';
import { NotFoundException } from '@nestjs/common';
import { aiService, installAiServiceTestbed, mockAuditService, mockConversationService, mockProvider, mockToolGate, mockToolRegistry } from '../../test/ai-service.testbed';

beforeEach(installAiServiceTestbed);

  describe('AiService › 治理策略与工具边界', () => {
    afterEach(() => {
      (aiService as any).governancePolicy = undefined;
    });

    it('_assertToolAllowed：治理策略禁用工具抛错', async () => {
      (mockToolGate as any).governancePolicy = { isToolEnabled: jest.fn().mockResolvedValue(false) };
      await expect(mockToolGate.assertToolAllowed('query_events', '1')).rejects.toThrow('disabled by governance policy');
    });

    it('_assertToolAllowed：角色白名单不含用户角色抛错', async () => {
      (mockToolGate as any).governancePolicy = {
        isToolEnabled: jest.fn().mockResolvedValue(true),
        getAllowedRoles: jest.fn().mockResolvedValue(['admin']),
      };
      (mockToolGate as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 1, role: 'user' }) };
      await expect(mockToolGate.assertToolAllowed('query_events', '1')).rejects.toThrow('restricted to roles');
    });

    it('§internal.16 A-5 getAuthorizationChain：聚合角色 grants + 工具策略 + 生效期', async () => {
      const explainer = new AuthorizationExplainerService(
        mockToolRegistry as any,
        {
          describeForUser: jest.fn().mockReturnValue({
            role: 'user',
            basis: '普通用户：可管理本人拥有的资源',
            resources: [
              { subject: 'Event', scope: 'own', reason: '只能操作自己的数据' },
              { subject: 'Todo', scope: 'own', reason: '只能操作自己的数据' },
            ],
          }),
        } as any,
        {
          getPolicy: jest.fn().mockResolvedValue({
            tools: { query_customers: { enabled: true, allowedRoles: ['user', 'admin'] } },
            audit: { granularity: 'all' },
            updatedAt: new Date('2026-08-31T00:00:00Z'),
          }),
        } as any,
      );
      const chain = await explainer.getAuthorizationChain({ role: 'user', sub: 42, username: 'alex' });
      expect(chain.user.username).toBe('alex');
      expect(chain.grants).toHaveLength(2);
      expect(chain.grants[0]).toMatchObject({ resource: 'Event', scope: 'own' });
      expect(chain.toolPolicies[0]).toMatchObject({ toolName: 'query_customers', enabled: true, riskLevel: 'R1' });
      expect(chain.effectiveSince).toEqual(new Date('2026-08-31T00:00:00Z'));
    });

    it("_assertToolAllowed：headless 系统账号 '0' 跳过邮箱校验", async () => {
      mockToolRegistry.getTool.mockReturnValue({ permissions: { requireVerifiedEmail: true } } as any);
      (mockToolGate as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 0, emailVerified: false }) };
      await expect(mockToolGate.assertToolAllowed('query_events', '0')).resolves.toBeUndefined();
      expect((mockToolGate as any).usersService.findOne).not.toHaveBeenCalled();
    });

    it("_assertToolAllowed：admin 视为已验证（对齐 EmailVerificationGuard）", async () => {
      mockToolRegistry.getTool.mockReturnValue({ permissions: { requireVerifiedEmail: true } } as any);
      (mockToolGate as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 1, role: 'admin', emailVerified: false }) };
      await expect(mockToolGate.assertToolAllowed('query_events', '1')).resolves.toBeUndefined();
    });

    it('_assertToolAllowed：requireVerifiedEmail 未验证抛 EMAIL_NOT_VERIFIED', async () => {
      mockToolRegistry.getTool.mockReturnValue({ permissions: { requireVerifiedEmail: true } } as any);
      (mockToolGate as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 1, emailVerified: false }) };
      await expect(mockToolGate.assertToolAllowed('query_events', '1')).rejects.toMatchObject({ errorCode: 'EMAIL_NOT_VERIFIED' });
    });

    it('_assertToolAllowed：featureFlag 关闭抛错', async () => {
      (mockToolGate as any).featureFlagsService = { isEnabled: jest.fn().mockReturnValue(false) };
      mockToolRegistry.getTool.mockReturnValue({ permissions: { featureFlag: 'ai' } } as any);
      await expect(mockToolGate.assertToolAllowed('query_events', '1')).rejects.toThrow('feature flag');
      (mockToolGate as any).featureFlagsService = undefined;
    });

    it('_shouldAudit：off/write/all 粒度门控', async () => {
      const policy = { getAuditGranularity: jest.fn() };
      (aiService as any).governancePolicy = policy;
      policy.getAuditGranularity.mockResolvedValue('off');
      expect(await (aiService as any)._shouldAudit('conversation')).toBe(false);
      expect(await (aiService as any)._shouldAudit('tool')).toBe(false);
      policy.getAuditGranularity.mockResolvedValue('write');
      expect(await (aiService as any)._shouldAudit('tool')).toBe(true);
      expect(await (aiService as any)._shouldAudit('conversation')).toBe(false);
      policy.getAuditGranularity.mockResolvedValue('all');
      expect(await (aiService as any)._shouldAudit('conversation')).toBe(true);
    });

    it('_requiresConfirmation：治理策略覆盖工具默认', async () => {
      (mockToolGate as any).governancePolicy = { requiresConfirmation: jest.fn().mockResolvedValue(true) };
      await expect(mockToolGate.requiresConfirmation('query_events')).resolves.toBe(true);
    });

    it('_requiresApproval：声明 R4→true；R3→false；无策略回落声明；策略 mode 可升档（§internal.15(4)）', async () => {
      (mockToolGate as any).governancePolicy = undefined;
      mockToolRegistry.riskLevel.mockReturnValue('R4');
      await expect(mockToolGate.requiresApproval('review_approval_request')).resolves.toBe(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      await expect(mockToolGate.requiresApproval('create_event')).resolves.toBe(false);
      (mockToolGate as any).governancePolicy = { requiresApproval: jest.fn().mockResolvedValue(true) };
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      await expect(mockToolGate.requiresApproval('create_event')).resolves.toBe(true);
    });

  });

  describe('会话生命周期边界', () => {
    it('chat：会话不存在（NotFound）时自动新建', async () => {
      mockConversationService.getConversation.mockRejectedValue(new NotFoundException('not found'));
      const conv = { id: 'conv-new', userId: '1' };
      mockConversationService.createConversation.mockReturnValue(conv);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      const result = await aiService.chat('1', { message: '你好', conversationId: 'stale-id' });
      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(result.conversationId).toBe('conv-new');
    });

    it('chat：导航意图不走 LLM，直接返回跳转', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'should not be used' });
      const result = await aiService.chat('1', { message: '打开事件列表' });
      expect(mockProvider.generate).not.toHaveBeenCalled();
      expect(result.reply).toContain('事件');
    });
  });

  describe('plan 意图（Plan-and-Execute）', () => {
    beforeEach(() => {
      // 禁用技能匹配，确保走 plan 意图而非 delegate
      (aiService as any).subAgentOrchestrator = { matchSkill: jest.fn().mockReturnValue(null) };
    });
    afterEach(() => {
      (aiService as any).planExecuteAgent = undefined;
      (aiService as any).reflectionAgent = undefined;
    });

    it('步骤结果非空：LLM 汇总 + reflection 精化', async () => {
      const mockPlan = {
        planAndExecute: jest.fn().mockResolvedValue({
          stepResults: ['r1', 'r2'],
          content: 'plan content',
          usage: { promptTokens: 400, completionTokens: 30 },
        }),
      };
      const mockReflect = {
        reflect: jest.fn().mockResolvedValue({
          content: '精化后的回答',
          usage: { promptTokens: 260, completionTokens: 18 },
        }),
      };
      (aiService as any).planExecuteAgent = mockPlan;
      (aiService as any).reflectionAgent = mockReflect;
      mockProvider.generate.mockResolvedValueOnce({ content: 'raw summary', usage: { promptTokens: 10, completionTokens: 5 } });

      // 「计划」命中关键词 → 分类不走 LLM，generate 只被汇总调用
      const result = await aiService.chat('1', { message: '为下个月制定执行计划' });

      expect(mockPlan.planAndExecute).toHaveBeenCalled();
      expect(mockReflect.reflect).toHaveBeenCalled();
      expect(result.reply).toBe('精化后的回答');

      // 整轮 = 规划 + 汇总 + 反思；此前只记了汇总那 10/5，规划与反思全部漏计
      expect(result.usage).toEqual({ promptTokens: 670, completionTokens: 53 });

      const planAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'plan' && e.conversationId);
      expect(planAudit.promptTokens).toBe(670);
      expect(planAudit.completionTokens).toBe(53);
    });

    it('步骤结果为空：回退标准工具循环', async () => {
      (aiService as any).planExecuteAgent = { planAndExecute: jest.fn().mockResolvedValue({ stepResults: [], content: '' }) };
      mockProvider.generate.mockResolvedValue({ content: '工具循环结果', toolCalls: [] });

      const result = await aiService.chat('1', { message: '制定一个执行计划' });

      expect(result.reply).toContain('工具循环结果');
    });

    it('§22.19 AU-2：plan 步骤执行的只读工具也落一行 tool_call（与子代理同一条口径）', async () => {
      // plan 步骤经由注入的 readOnlyExecutor 执行 —— 本刀把它与子代理一并覆盖；
      // 只算子代理会留下「主链路记、plan 不记」的第三种口径。
      const mockPlan = {
        planAndExecute: jest.fn(async (...args: any[]) => {
          const readOnlyExecutor = args[5];
          const result = await readOnlyExecutor('count_events_by_status', { status: 'done' }, '1');
          expect(result.success).toBe(true);
          return { stepResults: ['r1'], content: 'plan content' };
        }),
      };
      (aiService as any).planExecuteAgent = mockPlan;
      (aiService as any).reflectionAgent = { reflect: jest.fn().mockResolvedValue({ content: 'OK' }) };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { count: 3 } });
      mockProvider.generate.mockResolvedValue({ content: '汇总' });

      await aiService.chat('1', { message: '为下个月制定执行计划' });

      const rows = (mockAuditService.log as jest.Mock).mock.calls.map((c) => c[0]);
      const toolRow = rows.find((e) => e.action === 'tool_call');
      expect(toolRow.detail).toBe('count_events_by_status({"status":"done"})');
      expect(toolRow.parentActionId).toBeTruthy();
      expect(rows.find((e) => e.action === 'plan').parentActionId).toBe(toolRow.parentActionId);
    });
  });

  describe('工具摘要与流式回退', () => {

  });
