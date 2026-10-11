// SPDX-License-Identifier: Apache-2.0

import { AiService } from './ai.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiService, config, confirmationStore, installAiServiceTestbed, llmRouter, mockAuditService, mockAuthorizationExplainer, mockConversation, mockConversationService, mockMemoriesService, mockProvider, mockProviderFactory, mockRagAgent, mockSubAgentOrchestrator, mockToolGate, mockToolRegistry, mockUsageQuota, presentation, r4Approval, toolExecution, toolExposure } from '../../test/ai-service.testbed';

beforeEach(installAiServiceTestbed);






  describe('AiService › chat()', () => {
    it('should create a new conversation and return text reply', async () => {
      mockProvider.generate.mockResolvedValue({
        content: 'Hello! How can I help you?',
      });

      const result = await aiService.chat('1', { message: 'Hi' });

      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(mockConversationService.appendMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(result.reply).toBe('Hello! How can I help you?');
      expect(result.conversationId).toBe('conv-1');
      // ② 绑定：ChatResponse 键集 ⊆ chat-response 冻结契约（navigateTo/toolCalls 可选）
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/chat-response.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      expect(Object.keys(result).filter((k) => !props.includes(k))).toEqual([]);
    });

    it('should continue existing conversation when conversationId provided', async () => {
      mockConversationService.getConversation.mockReturnValue({
        ...mockConversation,
        messages: [
          { role: 'user', content: 'Hi', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Hello!', timestamp: new Date().toISOString() },
        ],
      });
      mockProvider.generate.mockResolvedValue({
        content: 'Sure, let me check...',
      });

      const result = await aiService.chat('1', {
        message: 'What events do I have?',
        conversationId: 'conv-1',
      });

      expect(mockConversationService.getConversation).toHaveBeenCalledWith('conv-1', '1', expect.anything());
      expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      expect(result.conversationId).toBe('conv-1');
    });

    it('should execute tool calls and return final response', async () => {
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-07-01","endDate":"2026-07-31"}',
          },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting', startTime: '2026-07-15T10:00:00Z' }],
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'You have 1 event this month: Meeting on July 15.',
      });

      const result = await aiService.chat('1', { message: '查询我的事件' });

      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        'query_events',
        { startDate: '2026-07-01', endDate: '2026-07-31' },
        '1',
      );
      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
      expect(result.reply).toBe('You have 1 event this month: Meeting on July 15.');
    });

    it('A-5: 非流式放行工具审计落事件时点授权快照（allowed:true，对齐流式路径）', async () => {
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-07-01","endDate":"2026-07-31"}',
          },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'You have 1 event.' });

      await aiService.chat('1', { message: '查询我的事件' });

      const auditCall = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c) => c[0]?.action === 'tool_call' && String(c[0]?.detail ?? '').startsWith('query_events'),
      );
      expect(auditCall).toBeDefined();
      const snapshot = JSON.parse(auditCall![0].authorization);
      expect(snapshot.allowed).toBe(true);
      expect(snapshot.tool).toBe('query_events');
      expect(snapshot.checks.some((c: any) => c.name === 'user_scoped' && c.ok)).toBe(true);
    });

    it('HS-2: should reject tool when feature flag is off', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'web_search',
        permissions: { featureFlag: 'ai' },
      } as any);
      // 注入一个 featureFlagsService 使 flag 关闭生效
      (mockToolGate as any).featureFlagsService = {
        isEnabled: jest.fn().mockReturnValue(false),
      };
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'web_search', arguments: '{"query":"weather"}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: {} });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'I cannot search right now.',
      });

      await aiService.chat('1', { message: '查一下天气' });

      // 门控抛错 → execute 不被调用，LLM 收到失败结果
      expect(mockToolRegistry.execute).not.toHaveBeenCalledWith(
        'web_search',
        { query: 'weather' },
        '1',
      );
    });

    it('T5 非流式 deny 落审计：authorization 序列化 reasons（决策轨迹「为何阻止」）', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'web_search',
        permissions: { featureFlag: 'ai' },
      } as any);
      (mockToolGate as any).featureFlagsService = {
        isEnabled: jest.fn().mockReturnValue(false),
      };
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"weather"}' }],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'I cannot search right now.' });

      await aiService.chat('1', { message: '查一下天气' });

      // W5-⑦：deny 审计行 isError + authorization 序列化真实 reasons（与 executeToolForExternal/MCP/流式同形状）
      const denyAudit = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c) =>
          c[0]?.action === 'tool_call' &&
          c[0]?.isError === true &&
          String(c[0]?.detail ?? '').startsWith('web_search'),
      );
      expect(denyAudit).toBeDefined();
      expect(denyAudit![0].errorMessage).toContain('disabled');
      const reasons = JSON.parse(denyAudit![0].authorization);
      expect(Array.isArray(reasons)).toBe(true);
      expect(reasons.some((r: { name: string; ok: boolean }) => r.name === 'feature_flag' && r.ok === false)).toBe(true);
    });

    it('HS-2: should reject write tool when email not verified', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'create_event',
        requiresConfirmation: true,
        permissions: { requireVerifiedEmail: true },
      } as any);
      (mockToolGate as any).featureFlagsService = undefined;
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'create_event', arguments: '{"title":"Meeting"}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'You need to verify your email first.',
      });

      await aiService.chat('1', { message: '创建会议' });

      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('HS-3: should skip duplicate write tool execution when idempotency hit', async () => {
      // 注入 mock toolEffectsService：findExisting 命中已有副作用
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('existing-key'),
        findExisting: jest.fn().mockResolvedValue({
          existing: true,
          effect: { resultId: 99, resultType: 'event' },
        }),
        record: jest.fn(),
      };
      mockToolRegistry.getTool.mockReturnValue({
        name: 'create_event',
        requiresConfirmation: true,
        permissions: { requireVerifiedEmail: true },
      } as any);
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'create_event', arguments: '{"title":"Meeting"}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 100 } });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'Event created.',
      });

      await aiService.chat('1', { message: '创建会议' });

      // 幂等命中：不重复执行，返回已有 resultId 99
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      // 清理注入，避免影响后续测试
      (toolExecution as any).toolEffectsService = undefined;
    });

    it('should handle multiple sequential tool calls', async () => {
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'query_events', arguments: '{"startDate":"2026-07-01","endDate":"2026-07-31"}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_2', name: 'get_user_stats', arguments: '{}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { totalEvents: 5, activeEvents: 3 },
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'You have 1 event and 3 active events total.',
      });

      const result = await aiService.chat('1', { message: 'My summary' });

      expect(mockProvider.generate).toHaveBeenCalledTimes(3);
      expect(result.reply).toBe('You have 1 event and 3 active events total.');
    });

    it('should sum token usage across tool rounds', async () => {
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call_1', name: 'query_events', arguments: '{}' }],
        usage: { promptTokens: 1000, completionTokens: 20 },
      });
      mockToolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'You have 1 event.',
        usage: { promptTokens: 2000, completionTokens: 50 },
      });

      // 含 query 关键词 → router 关键词短路，不额外消耗一次 generate（保持 2 次调用可断言）
      const result = await aiService.chat('1', { message: '查我的事件' });

      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
      // 两轮各是一次真实 LLM 调用 → 整轮开销是两轮之和，只留最后一轮会漏掉首轮
      expect(result.usage).toEqual({ promptTokens: 3000, completionTokens: 70 });

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      expect(chatAudit.promptTokens).toBe(3000);
      expect(chatAudit.completionTokens).toBe(70);
    });

    it("should put a tool's internal LLM usage on its tool_call row, not the chat row", async () => {
      mockProvider.generate
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'summarize_customer_360', arguments: '{"customerId":1}' },
          ],
          usage: { promptTokens: 500, completionTokens: 10 },
        })
        .mockResolvedValueOnce({
          content: '客户概况',
          usage: { promptTokens: 700, completionTokens: 30 },
        });
      // 工具内部自调 LLM，用量随 ToolResult 带出
      mockToolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { summary: '客户 A 风险中等' },
        usage: { promptTokens: 300, completionTokens: 40 },
      });

      const result = await aiService.chat('1', { message: '查我的事件' });

      // 对话行只含对话自身的两次调用；工具那 300/40 记在工具自己那行，不混进对话
      expect(result.usage).toEqual({ promptTokens: 1200, completionTokens: 40 });

      const calls = (mockAuditService.log as jest.Mock).mock.calls.map((c) => c[0]);
      const toolAudit = calls.find((e) => e.action === 'tool_call' && e.conversationId);
      expect(toolAudit.promptTokens).toBe(300);
      expect(toolAudit.completionTokens).toBe(40);

      // usage 不得进 LLM 上下文：喂回模型的那条 tool 消息里不能出现它
      const toolMessage = (
        mockProvider.generate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'tool');
      expect(toolMessage).toBeDefined();
      expect(toolMessage!.content).not.toContain('usage');
      expect(toolMessage!.content).toContain('客户 A 风险中等');
    });

    it('should include the intent-classification tokens in the turn usage', async () => {
      // 消息不含任何关键词 → 意图分类走 LLM（这是本轮第一笔真实调用）
      mockProvider.generate.mockResolvedValueOnce({
        content: 'chat',
        usage: { promptTokens: 300, completionTokens: 4 },
      });
      // 分类为 chat → 默认工具循环，一次 generate 即收尾
      mockProvider.generate.mockResolvedValueOnce({
        content: '今天不错',
        usage: { promptTokens: 900, completionTokens: 60 },
      });

      const result = await aiService.chat('1', { message: '今天心情挺好' });

      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
      // 整轮 = 分类 + 对话：分类那笔此前完全不记账
      expect(result.usage).toEqual({ promptTokens: 1200, completionTokens: 64 });

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      expect(chatAudit.promptTokens).toBe(1200);
      expect(chatAudit.completionTokens).toBe(64);
    });

    it('should use specified provider when provided', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'OK' });

      await aiService.chat('1', {
        message: 'Hi',
        provider: 'qwen',
        model: 'qwen-max',
      });

      expect(mockProviderFactory.getProvider).toHaveBeenCalledWith('qwen');
    });

    it('should use default provider when not specified', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'OK' });

      await aiService.chat('1', { message: 'Hi' });

      expect(mockProviderFactory.getProvider).toHaveBeenCalledWith('deepseek');
    });

    it('should handle tool execution failure gracefully', async () => {
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'query_events', arguments: '{}' },
        ],
      });
      mockToolRegistry.execute.mockResolvedValue({
        success: false,
        error: 'Database error',
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: 'Sorry, I could not query the events due to a database error.',
      });

      const result = await aiService.chat('1', { message: 'Events' });

      expect(mockProvider.generate).toHaveBeenCalledTimes(2);
      expect(result.reply).toContain('database error');
    });

    it('should fallback to next provider when primary fails', async () => {
      mockProviderFactory.getProvider
        .mockReset()
        .mockReturnValueOnce(mockProvider as any) // first attempt: deepseek
        .mockReturnValueOnce(mockProvider as any); // fallback: qwen

      mockProvider.generate
        .mockRejectedValueOnce(new Error('Rate limited'))
        .mockResolvedValueOnce({ content: 'Fallback response' });

      const result = await aiService.chat('1', { message: 'Hi' });

      expect(result.reply).toBe('Fallback response');
    });

    it('should throw when all providers fail', async () => {
      mockProvider.generate.mockRejectedValue(new Error('All providers down'));

      await expect(
        aiService.chat('1', { message: 'Hi' }),
      ).rejects.toMatchObject({ errorCode: 'LLM_UNAVAILABLE' });
    });

    it('should include tool definitions in LLM call when tools are registered', async () => {
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'query_events',
            description: 'Query events',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]);
      mockProvider.generate.mockResolvedValue({ content: 'OK' });

      await aiService.chat('1', { message: '我的事件' });

      const generateParams = mockProvider.generate.mock.calls[0][0];
      expect(generateParams.tools).toBeDefined();
      expect(generateParams.tools).toHaveLength(1);
    });

    it('should include system prompt in conversation', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'OK' });

      await aiService.chat('1', { message: '查看事件' });

      const generateParams = mockProvider.generate.mock.calls[0][0];
      const systemMsg = generateParams.messages.find(
        (m: any) => m.role === 'system',
      );
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toBe(config.systemPrompt);
    });

    it('should answer from knowledge base via RAG when intent is knowledge', async () => {
      mockRagAgent.answer.mockResolvedValue({
        content: '根据知识库，员工每年可享受 5 天年假。',
        articles: [{ id: 1, title: '休假政策', content: '员工每年可享受 5 天年假' }],
      });

      const result = await aiService.chat('1', { message: '年假政策是什么？' });

      expect(mockRagAgent.answer).toHaveBeenCalled();
      expect(result.reply).toBe('根据知识库，员工每年可享受 5 天年假。');
      expect(mockConversationService.appendMessage).toHaveBeenCalledTimes(2); // user + assistant
    });

    it('should record token usage for the knowledge path', async () => {
      mockRagAgent.answer.mockResolvedValue({
        content: '根据知识库，员工每年可享受 5 天年假。',
        articles: [{ id: 1, title: '休假政策', content: '员工每年可享受 5 天年假' }],
        usage: { promptTokens: 880, completionTokens: 42 },
      });

      const result = await aiService.chat('1', { message: '年假政策是什么？' });

      expect(result.usage).toEqual({ promptTokens: 880, completionTokens: 42 });

      const knowledgeAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'knowledge' && e.conversationId);
      expect(knowledgeAudit.promptTokens).toBe(880);
      expect(knowledgeAudit.completionTokens).toBe(42);
    });

    it('should NOT auto-execute a write tool in non-streaming chat', async () => {
      // 非流式无确认通道：写工具不执行，返回引导提示
      mockProvider.generate
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'create_event', arguments: '{"title":"T","startTime":"S","endTime":"E"}' },
          ],
        })
        .mockResolvedValueOnce({ content: '写操作需要流式确认。' });

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);

      const result = await aiService.chat('1', { message: '帮我创建事件' });

      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      expect(result.reply).toBe('写操作需要流式确认。');
    });

    it('should inject long-term memory as a second system message', async () => {
      mockMemoriesService.getForUser.mockResolvedValue([
        { content: '用户称呼：阿杰', type: 'identity' },
      ]);
      mockProvider.generate.mockResolvedValue({ content: '好的，阿杰！' });

      await aiService.chat('1', { message: '你好' });

      // 找到 tool loop 的 generate 调用（router classify 的调用不含 buildMessages 的记忆）
      const call = (mockProvider.generate.mock.calls as any[]).find((c) =>
        (c[0].messages as any[]).some(
          (m: any) => m.role === 'system' && String(m.content).includes('长期记忆'),
        ),
      );
      expect(call).toBeDefined();
      const systemMsgs = (call[0].messages as any[]).filter(
        (m: any) => m.role === 'system',
      );
      expect(systemMsgs.length).toBe(2);
      expect(systemMsgs[1].content).toContain('用户称呼：阿杰');
    });

    it('should delegate a skill-matched request to the orchestrator and summarize', async () => {
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      mockSubAgentOrchestrator.run.mockResolvedValue({
        content: '步骤 1（calendar）...',
        stepResults: ['a', 'b', 'c'],
        usedSkill: 'week-plan',
      });
      // 总结 generate + 反思 generate（reflect 用同一个 mock provider）
      mockProvider.generate.mockResolvedValue({ content: '已为你安排本周', usage: { promptTokens: 1, completionTokens: 1 } });

      const result = await aiService.chat('1', { message: '帮我安排本周' });

      expect(mockSubAgentOrchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({ userRequest: '帮我安排本周', userId: '1' }),
      );
      expect(result.reply).toBe('已为你安排本周');
    });

    it('should include the whole delegate pipeline in the turn usage', async () => {
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      mockSubAgentOrchestrator.run.mockResolvedValue({
        content: '子代理结果',
        stepResults: ['a', 'b'],
        usedSkill: 'week-plan',
        usage: { promptTokens: 1500, completionTokens: 90 },
      });
      // 汇总调用（回答须 ≥50 字，否则反思会被长度门限跳过）
      mockProvider.generate.mockResolvedValueOnce({
        content: '这是一段超过五十个字符的汇总回答，用于触发反思流程并确保长度判断条件成立，从而让反思调用真实发生，不被长度门限跳过。',
        usage: { promptTokens: 800, completionTokens: 120 },
      });
      // 反思调用（判定 OK、保留原文）
      mockProvider.generate.mockResolvedValueOnce({
        content: 'OK',
        usage: { promptTokens: 700, completionTokens: 3 },
      });

      const result = await aiService.chat('1', { message: '帮我安排本周' });

      // 整轮 = 分解+子代理多轮循环(1500) + 汇总(800) + 反思(700)；此前只记了汇总那一次
      expect(result.usage).toEqual({ promptTokens: 3000, completionTokens: 213 });

      const delegateAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'delegate' && e.conversationId);
      expect(delegateAudit.promptTokens).toBe(3000);
      expect(delegateAudit.completionTokens).toBe(213);
    });

    it('§22.19 AU-2：子代理执行的只读工具落一行 tool_call，与对话级行共用同一个 parentActionId', async () => {
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      // 替身**真的走**注入进去的 readOnlyExecutor —— 这正是本刀要验的那条路。
      // 替身自己不写任何审计，故下面那行只可能来自 AiService 一侧（旧实现为 0 行 ⇒ 断言必红）。
      mockSubAgentOrchestrator.run.mockImplementation(async (params: any) => {
        const result = await params.readOnlyExecutor('count_events_by_status', { status: 'done' }, '1');
        expect(result.success).toBe(true);
        return { content: '子代理结果', stepResults: ['a'] };
      });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { count: 3 } });
      mockProvider.generate.mockResolvedValue({
        content: '已为你安排本周',
        usage: { promptTokens: 1, completionTokens: 1 },
      });

      await aiService.chat('1', { message: '帮我安排本周' });

      const rows = (mockAuditService.log as jest.Mock).mock.calls.map((c) => c[0]);
      const toolRow = rows.find((e) => e.action === 'tool_call');
      // 行形状与主链路同源（buildToolCallAudit）：detail 是「工具名(参数)」
      expect(toolRow.detail).toBe('count_events_by_status({"status":"done"})');
      expect(toolRow.isError).toBe(false);
      expect(toolRow.parentActionId).toBeTruthy();

      // 对话级行带同一个句柄 —— 整轮的行因此一次查询可取回
      const conversationRow = rows.find((e) => e.action === 'delegate');
      expect(conversationRow.parentActionId).toBe(toolRow.parentActionId);
    });

    it('§22.19 AU-2：粒度 off 时子代理路径只执行、不落行（与主链路同一粒度门）', async () => {
      (aiService as any).governancePolicy = {
        getAuditGranularity: jest.fn().mockResolvedValue('off'),
      };
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      mockSubAgentOrchestrator.run.mockImplementation(async (params: any) => {
        await params.readOnlyExecutor('count_events_by_status', {}, '1');
        return { content: '子代理结果', stepResults: ['a'] };
      });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { count: 3 } });
      mockProvider.generate.mockResolvedValue({ content: '已为你安排本周' });

      await aiService.chat('1', { message: '帮我安排本周' });

      // 工具**确实执行了**（否则「不落行」是被「压根没执行」骗过的假绿）
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('count_events_by_status', {}, '1');
      const rows = (mockAuditService.log as jest.Mock).mock.calls.map((c) => c[0]);
      expect(rows.filter((e) => e.action === 'tool_call')).toHaveLength(0);
    });

    it('非流式 + 外部读工具：经 provider 执行并落 tool_call 审计（与内置工具同形）', async () => {
      // 强制走 runToolLoop（对齐下一条用例）：编排器返回空
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      mockSubAgentOrchestrator.run.mockResolvedValue({ content: '', stepResults: [] });
      // provider 必须完整（含 listExternalTools）——否则外部工具进不了 tool defs、压根不执行，
      // 会得出「工具执行了却没审计」的假结论（本用例正是为此而写）
      toolExposure.registerExternalToolProvider({
        listExternalTools: async () => [
          { name: 'mcp_wx_get_weather', description: '查天气', parameters: { type: 'object' } },
        ],
        isExternal: (n: string) => n.startsWith('mcp_'),
        requiresConfirmation: async () => false,
        callTool: async () => ({ executed: true, content: '晴 26°C' }),
      } as any);
      // 忠实模拟真实注册表：外部名不在本地注册表 → getTool / riskLevel 均抛
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'c1', name: 'mcp_wx_get_weather', arguments: '{"city":"sz"}' }],
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '深圳晴 26°C。',
        usage: { promptTokens: 1, completionTokens: 1 },
      });

      await aiService.chat('1', { message: '深圳天气' });

      const toolCall = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c) => c[0]?.action === 'tool_call' && String(c[0]?.detail ?? '').includes('mcp_wx_get_weather'),
      );
      expect(toolCall).toBeDefined();
      // 档位由外部判定派生（读 → R1）——覆盖非流式路径那处解释器调用的档位透传
      expect(JSON.parse(toolCall![0].authorization).riskLevel).toBe('R1');
    });

    it('should fall back to runToolLoop when orchestrator returns empty', async () => {
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      mockSubAgentOrchestrator.run.mockResolvedValue({ content: '', stepResults: [] });
      mockProvider.generate.mockResolvedValue({ content: '标准回复', usage: { promptTokens: 1, completionTokens: 1 } });

      const result = await aiService.chat('1', { message: '帮我安排本周' });

      expect(mockSubAgentOrchestrator.run).toHaveBeenCalled();
      expect(result.reply).toBe('标准回复');
    });

    it('should NOT delegate an action request even if it matches a skill keyword', async () => {
      mockSubAgentOrchestrator.matchSkill.mockReturnValue({ name: 'week-plan' } as any);
      // 「创建」触发 action 守卫 → 不走 delegate
      mockProvider.generate.mockResolvedValue({ content: '需要流式确认', usage: { promptTokens: 1, completionTokens: 1 } });

      await aiService.chat('1', { message: '创建本周计划' });

      expect(mockSubAgentOrchestrator.run).not.toHaveBeenCalled();
    });

    it('should inject the conversation summary as a system message when compactor returns one', async () => {
      const mockCompactor = {
        ensureCompacted: jest.fn().mockResolvedValue({
          conversation: {
            ...mockConversation,
            summary: '前文摘要内容',
            messages: [{ role: 'user', content: '最近问题', timestamp: new Date().toISOString() }],
          },
        }),
      };
      const withCompactor = new AiService(
        llmRouter as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        { log: jest.fn(), getUserLogs: jest.fn(), getStats: jest.fn(), getAllStats: jest.fn() } as any,
        mockUsageQuota as any,
        mockToolGate as any,
        toolExecution as any,
        r4Approval as any,
        presentation as any,
        toolExposure as any,
        mockRagAgent as any,
        { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
        mockMemoriesService as any,
        confirmationStore,
        mockCompactor as any,
        { matchSkill: jest.fn().mockReturnValue(null), run: jest.fn() } as any,
        mockAuthorizationExplainer as any,
      );
      mockProvider.generate.mockResolvedValue({ content: '好的' });

      await withCompactor.chat('1', { message: '你好' });

      expect(mockCompactor.ensureCompacted).toHaveBeenCalled();
      const call = (mockProvider.generate.mock.calls as any[]).find((c) =>
        (c[0].messages as any[]).some(
          (m: any) => m.role === 'system' && String(m.content).includes('前文摘要'),
        ),
      );
      expect(call).toBeDefined();
      const systemMsgs = (call[0].messages as any[]).filter(
        (m: any) => m.role === 'system',
      );
      // system + memory(空) + summary → 至少 2 条（memory 为空时不注入），summary 在最后
      expect(systemMsgs[systemMsgs.length - 1].content).toContain('前文摘要内容');
    });

    it('should include the compaction call in the turn usage', async () => {
      const mockCompactor = {
        ensureCompacted: jest.fn().mockResolvedValue({
          conversation: {
            ...mockConversation,
            messages: [{ role: 'user', content: '最近问题', timestamp: new Date().toISOString() }],
          },
          usage: { promptTokens: 640, completionTokens: 35 },
        }),
      };
      const withCompactor = new AiService(
        llmRouter as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        mockAuditService as any,
      mockUsageQuota as any,
      mockToolGate as any,
      toolExecution as any,
      r4Approval as any,
      presentation as any,
      toolExposure as any,
        mockRagAgent as any,
        { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
        mockMemoriesService as any,
        confirmationStore,
        mockCompactor as any,
        { matchSkill: jest.fn().mockReturnValue(null), run: jest.fn() } as any,
        mockAuthorizationExplainer as any,
      );
      mockProvider.generate.mockResolvedValue({
        content: '你有 1 个事件',
        usage: { promptTokens: 800, completionTokens: 20 },
      });

      // 「查」命中关键词 → 分类不走 LLM，压缩是唯一的前置开销
      const result = await withCompactor.chat('1', { message: '查我的事件' });

      // 整轮 = 上下文压缩(640) + 主调用(800)；此前压缩那笔完全不计
      expect(result.usage).toEqual({ promptTokens: 1440, completionTokens: 55 });

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      expect(chatAudit.promptTokens).toBe(1440);
    });
  });

