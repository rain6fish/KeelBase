import { AiService } from './ai.service';
import { NotFoundException } from '@nestjs/common';
import { LlmProviderFactory } from './providers/provider-factory';
import { ToolRegistry } from './tools/tool-registry';
import { ConversationService } from './conversation/conversation.service';
import { ConfirmationStore } from './confirmation/confirmation.store';
import { StreamChunk } from './interfaces/llm-provider.interface';

describe('AiService', () => {
  let aiService: AiService;
  let mockProviderFactory: jest.Mocked<LlmProviderFactory>;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockRagAgent: { answer: jest.Mock };
  let mockMemoriesService: any;
  let mockSubAgentOrchestrator: any;
  let confirmationStore: ConfirmationStore;
  let mockProvider: jest.Mocked<{
    name: string;
    displayName: string;
    availableModels: string[];
    isOpenAICompatible: jest.Mock;
    generate: jest.Mock;
    stream: jest.Mock;
  }>;
  let mockSettingsService: { getAiDailyLimit: jest.Mock; getWithDefault: jest.Mock };
  let mockAuditService: {
    log: jest.Mock;
    getUserLogs: jest.Mock;
    getStats: jest.Mock;
    getAllStats: jest.Mock;
    countChatsToday: jest.Mock;
  };

  const config = {
    defaultProvider: 'deepseek',
    defaultModel: 'deepseek-v4-flash',
    systemPrompt: 'You are a helpful assistant.',
  };

  const mockConversation = {
    id: 'conv-1',
    userId: '1',
    messages: [],
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockProvider = {
      name: 'deepseek',
      displayName: 'DeepSeek',
      availableModels: ['deepseek-v4-flash'],
      isOpenAICompatible: jest.fn().mockReturnValue(true),
      generate: jest.fn(),
      stream: jest.fn(),
    };

    mockProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getAllProviders: jest.fn(),
      register: jest.fn(),
      registerCustom: jest.fn(),
    } as any;

    mockToolRegistry = {
      getToolDefinitions: jest.fn().mockReturnValue([]),
      execute: jest.fn(),
      register: jest.fn(),
      getTool: jest.fn(),
      getAllTools: jest.fn(),
      requiresConfirmation: jest.fn().mockReturnValue(false),
      riskLevel: jest.fn().mockReturnValue('R1'),
    } as any;

    mockConversationService = {
      createConversation: jest.fn().mockReturnValue(mockConversation),
      getConversation: jest.fn().mockReturnValue(mockConversation),
      peekConversation: jest.fn().mockReturnValue(mockConversation),
      appendMessage: jest.fn(),
      deleteConversation: jest.fn(),
      getUserConversations: jest.fn(),
      deleteAllUserConversations: jest.fn(),
      cleanupExpiredConversations: jest.fn(),
    } as any;

    mockAuditService = {
      log: jest.fn(),
      getUserLogs: jest.fn(),
      getStats: jest.fn(),
      getAllStats: jest.fn(),
      countChatsToday: jest.fn().mockResolvedValue(0),
      incrementDailyUsage: jest.fn().mockResolvedValue(undefined),
    };

    mockSettingsService = {
      getAiDailyLimit: jest.fn().mockResolvedValue(0), // 0 = 不限
      getWithDefault: jest.fn().mockImplementation(async (_k: string, d: unknown) => d),
    };

    mockRagAgent = {
      answer: jest.fn(),
    };

    mockMemoriesService = {
      getForUser: jest.fn().mockResolvedValue([]),
      markUsed: jest.fn().mockResolvedValue(undefined),
      extractFromTurn: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      deleteAllForUser: jest.fn(),
      pruneExpired: jest.fn(),
    };

    confirmationStore = new ConfirmationStore(5000);

    mockSubAgentOrchestrator = {
      matchSkill: jest.fn().mockReturnValue(null),
      run: jest.fn().mockResolvedValue({ content: '', stepResults: [] }),
    };

    aiService = new AiService(
      mockProviderFactory as any,
      mockToolRegistry as any,
      mockConversationService as any,
      config,
      mockAuditService as any,
      mockRagAgent as any,
      { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
      mockMemoriesService as any,
      confirmationStore,
      { ensureCompacted: jest.fn().mockImplementation((c: any) => c) } as any,
      mockSubAgentOrchestrator as any,
      mockSettingsService as any,
    );
  });

  describe('chat()', () => {
    it('should create a new conversation and return text reply', async () => {
      mockProvider.generate.mockResolvedValue({
        content: 'Hello! How can I help you?',
      });

      const result = await aiService.chat('1', { message: 'Hi' });

      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(mockConversationService.appendMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(result.reply).toBe('Hello! How can I help you?');
      expect(result.conversationId).toBe('conv-1');
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

    it('HS-2: should reject tool when feature flag is off', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'web_search',
        permissions: { featureFlag: 'ai' },
      } as any);
      // 注入一个 featureFlagsService 使 flag 关闭生效
      (aiService as any).featureFlagsService = {
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

    it('HS-2: should reject write tool when email not verified', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'create_event',
        requiresConfirmation: true,
        permissions: { requireVerifiedEmail: true },
      } as any);
      (aiService as any).featureFlagsService = undefined;
      (aiService as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ id: 1, emailVerified: false }),
      };
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
      (aiService as any).toolEffectsService = {
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
      (aiService as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ id: 1, emailVerified: true }),
      };
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
      (aiService as any).toolEffectsService = undefined;
    });

    it('HS-3: _executeWriteTool 无已有副作用时执行并记录', async () => {
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (aiService as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('new-key'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
      };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 100 } });

      const result = await (aiService as any)._executeWriteTool('create_event', { title: 'X' }, '1', 'c1');

      expect(result).toEqual({ success: true, data: { id: 100 } });
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1', toolName: 'create_event', conversationId: 'c1' }),
        'event',
        100,
      );
      (aiService as any).toolEffectsService = undefined;
    });

    it('HS-3: _executeWriteTool 无 toolEffectsService 时直接执行不记录', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
      (aiService as any).toolEffectsService = undefined;
      const result = await (aiService as any)._executeWriteTool('create_event', {}, '1');
      expect(result).toEqual({ success: true, data: { id: 1 } });
    });

    it('HS-3: _executeWriteTool 外部 MCP 工具经 provider 调用', async () => {
      (aiService as any).externalToolProvider = {
        isExternal: jest.fn().mockReturnValue(true),
        callTool: jest.fn().mockResolvedValue({ executed: true, content: 'sent' }),
      };
      const result = await (aiService as any)._executeWriteTool('mcp_wx_send_email', { to: 'a' }, '1');
      expect(result).toEqual({ success: true, data: 'sent' });
      (aiService as any).externalToolProvider = undefined;
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

    it('HS-5: should truncate oversized tool results (array)', () => {
      const svc = aiService as any;
      const bigData = Array.from({ length: 500 }, (_, i) => ({ id: i, title: `Event ${i}`.repeat(10) }));
      const json = svc.truncateToolResult({ success: true, data: bigData });
      expect(json).toContain('_truncated');
      expect(json.length).toBeLessThan(5000);
      // 数组被截断到前 N 条
      expect(JSON.parse(json).data).toHaveLength(20);
    });

    it('HS-5: should truncate oversized object results', () => {
      const svc = aiService as any;
      const hugeObj: Record<string, string> = {};
      for (let i = 0; i < 200; i++) hugeObj[`key${i}`] = 'x'.repeat(50);
      const json = svc.truncateToolResult({ success: true, data: hugeObj });
      expect(json.length).toBeLessThan(5000);
      expect(json).toContain('_truncated');
    });

    it('HS-5: should keep small tool results unchanged', () => {
      const svc = aiService as any;
      const small = { success: true, data: [{ id: 1, title: 'Meeting' }] };
      const json = svc.truncateToolResult(small);
      expect(json).toBe(JSON.stringify(small));
      expect(json).not.toContain('_truncated');
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
      ).rejects.toThrow('All providers failed after 1 attempts');
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
          ...mockConversation,
          summary: '前文摘要内容',
          messages: [{ role: 'user', content: '最近问题', timestamp: new Date().toISOString() }],
        }),
      };
      const withCompactor = new AiService(
        mockProviderFactory as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        { log: jest.fn(), getUserLogs: jest.fn(), getStats: jest.fn(), getAllStats: jest.fn(), countChatsToday: jest.fn().mockResolvedValue(0), incrementDailyUsage: jest.fn().mockResolvedValue(undefined) } as any,
        mockRagAgent as any,
        { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
        mockMemoriesService as any,
        confirmationStore,
        mockCompactor as any,
        { matchSkill: jest.fn().mockReturnValue(null), run: jest.fn() } as any,
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
  });

  describe('chatStream()', () => {
    it('should yield text chunks from provider', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'text' as const, content: ' world' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks.filter((c) => c.type === 'text').length).toBe(2);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should handle tool calls from stream and continue streaming', async () => {
      async function* mockStreamWithToolCall() {
        yield { type: 'text' as const, content: 'Let me check' };
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-07-01"}',
          },
        };
        yield { type: 'done' as const };
      }
      // Second stream call after tool execution
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: 'Found: Meeting' };
        yield { type: 'done' as const };
      }

      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithToolCall())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'My events' })) {
        chunks.push(chunk);
      }

      // Should have text from both rounds, ending with done
      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // Should have called stream twice (first for tool call, second for result)
      expect(mockProvider.stream).toHaveBeenCalledTimes(2);
    });

    it('should yield error when stream returns error', async () => {
      async function* mockErrorStream() {
        yield { type: 'error' as const, error: 'API Error' };
      }
      mockProvider.stream.mockReturnValue(mockErrorStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
    });

    it('should fallback to a backup provider when the primary stream errors before content (CR-28)', async () => {
      const fallbackProvider = {
        name: 'qwen',
        displayName: 'Qwen',
        availableModels: [],
        isOpenAICompatible: jest.fn().mockReturnValue(true),
        generate: jest.fn(),
        stream: jest.fn(),
      };
      mockProviderFactory.getProvider.mockImplementation((name: string) =>
        name === 'qwen' ? fallbackProvider : mockProvider,
      );
      async function* primaryError() {
        yield { type: 'error' as const, error: 'Rate limited' };
      }
      async function* fallbackOk() {
        yield { type: 'text' as const, content: 'Fallback OK' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(primaryError());
      fallbackProvider.stream.mockReturnValue(fallbackOk());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.map((c) => (c as any).content)).toContain('Fallback OK');
      // 主 provider 的首块错误被回退吞掉，不应透传给客户端
      expect(
        chunks.some(
          (c) => c.type === 'error' && (c as any).error === 'Rate limited',
        ),
      ).toBe(false);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should fallback when provider.stream throws before yielding content (CR-28)', async () => {
      const fallbackProvider = {
        name: 'qwen',
        displayName: 'Qwen',
        availableModels: [],
        isOpenAICompatible: jest.fn().mockReturnValue(true),
        generate: jest.fn(),
        stream: jest.fn(),
      };
      mockProviderFactory.getProvider.mockImplementation((name: string) =>
        name === 'qwen' ? fallbackProvider : mockProvider,
      );
      mockProvider.stream.mockImplementation(() => {
        throw new Error('network down');
      });
      async function* fallbackOk() {
        yield { type: 'text' as const, content: 'Recovered' };
        yield { type: 'done' as const };
      }
      fallbackProvider.stream.mockReturnValue(fallbackOk());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks.filter((c) => c.type === 'text').map((c) => (c as any).content)).toContain('Recovered');
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should yield a single error chunk when all streaming providers fail (CR-28)', async () => {
      mockProvider.stream.mockReturnValue(
        (async function* () {
          yield { type: 'error' as const, error: 'boom' };
        })(),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
      expect((chunks[0] as any).error).toContain('All providers failed');
    });

    it('should include conversationId in the done chunk', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      const done = chunks[chunks.length - 1];
      expect(done.type).toBe('done');
      expect(done.conversationId).toBe('conv-1');
    });

    it('should yield confirmation_request before executing a write tool, then execute on approve', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '事件已创建' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { id: 42, title: '评审' },
      });

      // spy create 以拿到 token
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation((userId, toolName, args) => {
        const r = originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const it = aiService.chatStream('1', { message: 'create an event titled Review for tomorrow 9am' });
      // tool_start 先发（过程卡片）
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      expect(first.value.toolStart?.name).toBe('create_event');
      expect(first.value.toolStart?.summary).toContain('创建事件：评审');
      // W5-⑦ Explainable Authz：tool_start 携带 riskLevel + authorization
      expect(first.value.toolStart?.riskLevel).toBe('R3');
      expect(first.value.toolStart?.authorization?.riskStrategy).toBe('confirmation');
      expect(
        first.value.toolStart?.authorization?.checks.some((c: any) => c.name === 'user_scoped' && c.ok),
      ).toBe(true);
      expect(
        first.value.toolStart?.authorization?.checks.some((c: any) => c.name === 'risk_policy' && c.ok),
      ).toBe(true);
      // 确认前不执行写操作
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // confirmation_request
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');
      expect(second.value.confirmation?.toolName).toBe('create_event');
      expect(second.value.confirmation?.summary).toContain('创建事件：评审');
      // W5-⑦ Explainable Authz：确认请求携带为何需确认
      expect(second.value.confirmation?.authorization?.requiresConfirmation).toBe(true);
      expect(second.value.confirmation?.authorization?.riskLevel).toBe('R3');
      expect(pendingToken).toBeDefined();

      // 用户确认 → confirmation_decision + tool_end(success)
      confirmationStore.resolve(pendingToken!, '1', 'approve');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      expect(third.value.confirmationDecision?.approved).toBe(true);
      expect(third.value.confirmationDecision?.success).toBe(true);
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);

      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(true);
      expect(fourth.value.toolEnd?.summary).toBe('创建事件成功');

      // 后续文本 + done
      const chunks = [];
      for await (const c of it) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should NOT execute a write tool when user declines', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* mockStreamAfterDecline() {
        yield { type: 'text' as const, content: '好的，不创建了' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterDecline());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);

      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation((userId, toolName, args) => {
        const r = originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const it = aiService.chatStream('1', { message: 'create an event titled Review for tomorrow 9am' });
      // tool_start → confirmation_request
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');

      confirmationStore.resolve(pendingToken!, '1', 'reject');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      expect(third.value.confirmationDecision?.approved).toBe(false);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // decline 后仍发 tool_end(success:false)
      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(false);
      expect(fourth.value.toolEnd?.summary).toBe('操作已取消');

      const chunks = [];
      for await (const c of it) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should emit tool_start/tool_end around a read tool call', async () => {
      async function* mockStreamWithReadTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-08-01","endDate":"2026-08-07"}',
          },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '找到 2 个事件' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithReadTool())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query my events' })) {
        chunks.push(chunk);
      }

      const startIdx = chunks.findIndex((c) => c.type === 'tool_start');
      const endIdx = chunks.findIndex((c) => c.type === 'tool_end');
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(endIdx).toBeGreaterThan(startIdx);
      expect(chunks[startIdx].toolStart?.name).toBe('query_events');
      expect(chunks[startIdx].toolStart?.summary).toBe('查询事件');
      expect(chunks[endIdx].toolEnd?.success).toBe(true);
      expect(chunks[endIdx].toolEnd?.summary).toBe('查询到 2 个结果');
      // 工具执行后 text + done
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should emit paired tool_start/tool_end for two same-name tool calls', async () => {
      async function* mockStreamWithTwoTools() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'call_2', name: 'query_events', arguments: '{"status":"active"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: 'done' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoTools())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: [] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter((c) => c.type === 'tool_start');
      const ends = chunks.filter((c) => c.type === 'tool_end');
      expect(starts).toHaveLength(2);
      expect(ends).toHaveLength(2);
      // 顺序保证串行成对：start,end,start,end
      const order = chunks
        .filter((c) => c.type === 'tool_start' || c.type === 'tool_end')
        .map((c) => c.type);
      expect(order).toEqual(['tool_start', 'tool_end', 'tool_start', 'tool_end']);
    });

    it('should emit a failed tool_end when tool execution throws', async () => {
      async function* mockStreamWithReadTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
      }
      async function* mockStreamAfterError() {
        yield { type: 'text' as const, content: 'sorry' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithReadTool())
        .mockReturnValueOnce(mockStreamAfterError());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockRejectedValue(new Error('boom'));

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter((c) => c.type === 'tool_start');
      const ends = chunks.filter((c) => c.type === 'tool_end');
      expect(starts).toHaveLength(1);
      expect(ends).toHaveLength(1);
      expect(ends[0].toolEnd?.success).toBe(false);
    });

    it('should not hijack a write request containing a page keyword (帮我创建事件)', async () => {
      // 写操作动词「创建」命中 → 不走导航拦截，进入工具循环（最终 text + done，而非导航文本）
      async function* mockStream() {
        yield { type: 'text' as const, content: '好的，为你创建' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '帮我创建事件' })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBe(1);
      expect(textChunks[0].content).not.toContain('跳转');
    });

    it('should still navigate for a pure navigation request', async () => {
      // 去掉「帮我」后，纯导航「打开设置」仍走导航拦截，不调用 LLM
      async function* mockStream() {
        yield { type: 'text' as const, content: 'x' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '打开设置' })) {
        chunks.push(chunk);
      }

      // 导航路径只产出 text「已为您跳转到设置」+ done，不调用 provider.stream
      expect(mockProvider.stream).not.toHaveBeenCalled();
      const texts = chunks.filter((c) => c.type === 'text').map((c) => c.content);
      expect(texts[0]).toContain('跳转');
    });

    it('should treat 帮我查询 as a query (no action verb, no navigation hijack)', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: '查到 5 个事件' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '帮我查一下这个月的事件' })) {
        chunks.push(chunk);
      }

      // 命中 LLM 工具循环（provider.stream 被调用），非导航拦截
      expect(mockProvider.stream).toHaveBeenCalled();
      const texts = chunks.filter((c) => c.type === 'text').map((c) => c.content);
      expect(texts[0]).not.toContain('跳转');
    });

    it('chatStream：会话不存在（NotFound）时自动新建', async () => {
      mockConversationService.getConversation.mockRejectedValue(new NotFoundException('x'));
      mockConversationService.createConversation.mockReturnValue({ id: 'new-stream-conv' });
      async function* mockStream() {
        yield { type: 'text' as const, content: 'ok' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi', conversationId: 'stale' })) {
        chunks.push(chunk);
      }
      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('chatStream：工具循环超过最大轮数 → 道歉文本 + done', async () => {
      // 每次流都返回工具调用（query_events 安全执行）→ 循环 5 轮后超限
      async function* mockToolStream() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' },
        };
        yield { type: 'done' as const };
      }
      // mockReturnValue 复用同一已耗尽的 generator，需每轮新建才能触发超限
      mockProvider.stream.mockImplementation(() => mockToolStream());
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: [] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const texts = chunks.filter((c) => c.type === 'text');
      // 超限道歉文案 yield 给客户端
      expect(texts.some((c) => c.content.includes('unable to complete'))).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });
  });

  describe('RG-2.1 AI 每日限额', () => {
    it('limit=0（不限）时正常放行', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(0);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockProvider.generate).toHaveBeenCalled();
    });

    it('limit>0 且未超限时放行', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockAuditService.countChatsToday.mockResolvedValue(3);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockAuditService.countChatsToday).toHaveBeenCalledWith('1');
    });

    it('limit>0 且已达上限时抛 AI_DAILY_LIMIT', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockAuditService.countChatsToday.mockResolvedValue(10);

      await expect(aiService.chat('1', { message: 'hi' }))
        .rejects.toMatchObject({ errorCode: 'AI_DAILY_LIMIT' });
      expect(mockProvider.generate).not.toHaveBeenCalled();
    });

    it('流式 chatStream 同样校验限额', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(5);
      mockAuditService.countChatsToday.mockResolvedValue(5);

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'hi' })) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(mockProvider.stream).not.toHaveBeenCalled();
    });

    it('未注入 SettingsService 时跳过限额', async () => {
      // 构造一个不带 settingsService 的 AiService
      const bare = new AiService(
        mockProviderFactory as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        mockAuditService as any,
        mockRagAgent as any,
        { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
        mockMemoriesService as any,
        confirmationStore,
        { ensureCompacted: jest.fn().mockImplementation((c: any) => c) } as any,
        mockSubAgentOrchestrator as any,
      );
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(bare.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockAuditService.countChatsToday).not.toHaveBeenCalled();
    });
  });

  describe('AI-17 提示词管理', () => {
    it('Settings 配置了 ai_system_prompt 时优先使用', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue('自定义系统提示词');
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi' });

      // 主对话（工具循环）的调用以自定义 system 开头；router 分类用其自身 prompt
      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      expect(sent.messages[0].content).toBe('自定义系统提示词');
    });

    it('Settings 未配置时用默认 system prompt', async () => {
      mockSettingsService.getWithDefault.mockImplementation(async (_k: string, d: unknown) => d);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi' });

      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      expect(sent.messages[0].content).toBe(config.systemPrompt);
    });
  });

  describe('HS-10 MCP 出口方法', () => {
    describe('listMcpTools', () => {
      it('把工具定义映射为 MCP 工具清单', async () => {
        mockToolRegistry.getToolDefinitions.mockReturnValue([
          { type: 'function', function: { name: 'query_events', description: '查事件', parameters: { type: 'object', properties: { status: {} } } } },
        ] as any);
        const tools = await aiService.listMcpTools();
        expect(tools).toEqual([
          { name: 'query_events', description: '查事件', inputSchema: { type: 'object', properties: { status: {} } } },
        ]);
      });

      it('未注入治理策略时返回全部工具', async () => {
        mockToolRegistry.getToolDefinitions.mockReturnValue([
          { type: 'function', function: { name: 'a', description: '', parameters: {} } },
          { type: 'function', function: { name: 'b', description: '', parameters: {} } },
        ] as any);
        const tools = await aiService.listMcpTools();
        expect(tools).toHaveLength(2);
      });
    });

    describe('executeToolForExternal', () => {
      it('读工具（无需确认）→ 直接执行', async () => {
        mockToolRegistry.requiresConfirmation.mockReturnValue(false);
        mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 1 } });
        const out = await aiService.executeToolForExternal('query_events', { status: 'active' }, '1');
        expect(out.executed).toBe(true);
        expect(out.requiresConfirmation).toBe(false);
        expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', { status: 'active' }, '1');
      });

      it('写工具（需确认）→ 不执行，返回需确认信号', async () => {
        mockToolRegistry.requiresConfirmation.mockReturnValue(true);
        const out = await aiService.executeToolForExternal('create_event', {}, '1');
        expect(out.executed).toBe(false);
        expect(out.requiresConfirmation).toBe(true);
        expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      });

      it('R5 风险级 → 阻断（不执行也不确认）', async () => {
        mockToolRegistry.getTool.mockReturnValue({ name: 'irreversible_action', riskLevel: 'R5' });
        mockToolRegistry.riskLevel.mockReturnValue('R5');
        await expect(
          aiService.executeToolForExternal('irreversible_action', {}, '1'),
        ).rejects.toThrow('is blocked (risk level R5)');
        expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      });

      it('R4 风险级（human_approval）→ 仍需确认', async () => {
        mockToolRegistry.riskLevel.mockReturnValue('R4');
        mockToolRegistry.requiresConfirmation.mockReturnValue(true);
        const out = await aiService.executeToolForExternal('review_approval_request', { requestId: 1 }, '1');
        expect(out.executed).toBe(false);
        expect(out.requiresConfirmation).toBe(true);
      });
    });
  });

  describe('getToolInventory（HS-2 工具清单）', () => {
    it('暴露 riskLevel / riskStrategy', async () => {
      const fakeTool = {
        name: 'review_approval_request',
        description: '审批预审',
        parameters: [{ name: 'requestId', type: 'number', required: true }],
        requiresConfirmation: true,
      };
      mockToolRegistry.getAllTools.mockReturnValue([fakeTool as any]);
      mockToolRegistry.riskLevel.mockReturnValue('R4');
      const inv = await aiService.getToolInventory();
      expect(inv).toHaveLength(1);
      expect(inv[0].riskLevel).toBe('R4');
      expect(inv[0].riskStrategy).toBe('human_approval');
      expect(inv[0].requiresConfirmation).toBe(true);
    });
  });

  describe('HS-10 Agent 对话集成（ExternalToolProvider）', () => {
    let provider: {
      listExternalTools: jest.Mock;
      isExternal: jest.Mock;
      requiresConfirmation: jest.Mock;
      callTool: jest.Mock;
    };

    beforeEach(() => {
      provider = {
        listExternalTools: jest.fn().mockResolvedValue([
          { name: 'mcp_wx_get_weather', description: '查天气', parameters: { type: 'object' } },
          { name: 'mcp_wx_send_email', description: '发邮件', parameters: { type: 'object' } },
        ]),
        isExternal: jest.fn().mockImplementation((name: string) => name.startsWith('mcp_')),
        requiresConfirmation: jest.fn(),
        callTool: jest.fn(),
      };
      aiService.registerExternalToolProvider(provider as any);
    });

    it('_buildToolDefs 合并内置 + 外部工具定义', async () => {
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'query_events', description: '查事件', parameters: {} } },
      ] as any);
      const defs = await (aiService as any)._buildToolDefs();
      const names = defs.map((d: any) => d.function.name);
      expect(names).toContain('mcp_wx_get_weather');
      expect(names).toContain('mcp_wx_send_email');
      expect(names).toContain('query_events'); // 内置仍在
      expect(provider.listExternalTools).toHaveBeenCalled();
    });

    it('外部提供者缺失时 _buildToolDefs 只返回内置', async () => {
      const plain = new AiService(
        mockProviderFactory as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        mockAuditService as any,
        mockRagAgent as any,
        {} as any,
        mockMemoriesService as any,
        confirmationStore,
        {} as any,
        mockSubAgentOrchestrator as any,
      );
      const defs = await (plain as any)._buildToolDefs();
      expect(defs.every((d: any) => !d.function.name.startsWith('mcp_'))).toBe(true);
    });

    it('外部读工具 → 经 provider 执行并返回文本', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: '晴 26°C' });
      const result = await (aiService as any)._executeReadTool('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('晴 26°C');
    });

    it('内置读工具仍走 toolRegistry', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 1 } });
      const result = await (aiService as any)._executeReadTool('query_events', {}, '1');
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', {}, '1');
      expect(result.data).toEqual({ total: 1 });
    });

    it('外部写工具确认规则委托 provider', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      await expect((aiService as any)._requiresConfirmation('mcp_wx_send_email')).resolves.toBe(true);
      expect(provider.requiresConfirmation).toHaveBeenCalledWith('mcp_wx_send_email');
    });

    it('外部写工具经 _executeWriteTool 执行（跳过幂等/副作用）', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: 'sent' });
      const result = await (aiService as any)._executeWriteTool('mcp_wx_send_email', { to: 'a' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('sent');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('外部 provider 调用失败 → success false + error', async () => {
      provider.callTool.mockResolvedValue({ executed: false, error: 'remote down' });
      const result = await (aiService as any)._executeReadTool('mcp_wx_get_weather', {}, '1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('remote down');
    });
  });

  describe('治理策略与工具边界', () => {
    afterEach(() => {
      (aiService as any).governancePolicy = undefined;
      (aiService as any).usersService = undefined;
    });

    it('_assertToolAllowed：治理策略禁用工具抛错', async () => {
      (aiService as any).governancePolicy = { isToolEnabled: jest.fn().mockResolvedValue(false) };
      await expect((aiService as any)._assertToolAllowed('query_events', '1')).rejects.toThrow('disabled by governance policy');
    });

    it('_assertToolAllowed：角色白名单不含用户角色抛错', async () => {
      (aiService as any).governancePolicy = {
        isToolEnabled: jest.fn().mockResolvedValue(true),
        getAllowedRoles: jest.fn().mockResolvedValue(['admin']),
      };
      (aiService as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 1, role: 'user' }) };
      await expect((aiService as any)._assertToolAllowed('query_events', '1')).rejects.toThrow('restricted to roles');
    });

    it("_assertToolAllowed：headless 系统账号 '0' 跳过邮箱校验", async () => {
      mockToolRegistry.getTool.mockReturnValue({ permissions: { requireVerifiedEmail: true } } as any);
      (aiService as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 0, emailVerified: false }) };
      await expect((aiService as any)._assertToolAllowed('query_events', '0')).resolves.toBeUndefined();
      expect((aiService as any).usersService.findOne).not.toHaveBeenCalled();
    });

    it('_assertToolAllowed：requireVerifiedEmail 未验证抛 EMAIL_NOT_VERIFIED', async () => {
      mockToolRegistry.getTool.mockReturnValue({ permissions: { requireVerifiedEmail: true } } as any);
      (aiService as any).usersService = { findOne: jest.fn().mockResolvedValue({ id: 1, emailVerified: false }) };
      await expect((aiService as any)._assertToolAllowed('query_events', '1')).rejects.toMatchObject({ errorCode: 'EMAIL_NOT_VERIFIED' });
    });

    it('_assertToolAllowed：featureFlag 关闭抛错', async () => {
      (aiService as any).featureFlagsService = { isEnabled: jest.fn().mockReturnValue(false) };
      mockToolRegistry.getTool.mockReturnValue({ permissions: { featureFlag: 'ai' } } as any);
      await expect((aiService as any)._assertToolAllowed('query_events', '1')).rejects.toThrow('feature flag');
      (aiService as any).featureFlagsService = undefined;
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
      (aiService as any).governancePolicy = { requiresConfirmation: jest.fn().mockResolvedValue(true) };
      await expect((aiService as any)._requiresConfirmation('query_events')).resolves.toBe(true);
    });

    it('getToolInventory：治理策略覆盖开关', async () => {
      const tool = { name: 'query_events', description: 'd', parameters: [], toToolDefinition: () => ({}) };
      (aiService as any).governancePolicy = {
        getPolicy: jest.fn().mockResolvedValue({ tools: { query_events: { enabled: false, requiresConfirmation: true } } }),
      };
      mockToolRegistry.getAllTools.mockReturnValue([tool] as any);
      const inv = await aiService.getToolInventory();
      expect(inv[0].name).toBe('query_events');
      expect(inv[0].enabled).toBe(false);
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
      const mockPlan = { planAndExecute: jest.fn().mockResolvedValue({ stepResults: ['r1', 'r2'], content: 'plan content' }) };
      const mockReflect = { reflect: jest.fn().mockResolvedValue('精化后的回答') };
      (aiService as any).planExecuteAgent = mockPlan;
      (aiService as any).reflectionAgent = mockReflect;
      mockProvider.generate.mockResolvedValueOnce({ content: 'raw summary', usage: { promptTokens: 10, completionTokens: 5 } });

      const result = await aiService.chat('1', { message: '为下个月制定执行计划' });

      expect(mockPlan.planAndExecute).toHaveBeenCalled();
      expect(mockReflect.reflect).toHaveBeenCalled();
      expect(result.reply).toBe('精化后的回答');
    });

    it('步骤结果为空：回退标准工具循环', async () => {
      (aiService as any).planExecuteAgent = { planAndExecute: jest.fn().mockResolvedValue({ stepResults: [], content: '' }) };
      mockProvider.generate.mockResolvedValue({ content: '工具循环结果', toolCalls: [] });

      const result = await aiService.chat('1', { message: '制定一个执行计划' });

      expect(result.reply).toContain('工具循环结果');
    });
  });

  describe('工具摘要与流式回退', () => {
    it('summarizeReadTool 各分支', () => {
      const s = aiService as any;
      expect(s.summarizeReadTool('query_events')).toBe('查询事件');
      expect(s.summarizeReadTool('count_events_by_status')).toBe('统计事件');
      expect(s.summarizeReadTool('query_events_by_keyword')).toBe('搜索事件');
      expect(s.summarizeReadTool('get_user_stats')).toBe('获取用户统计');
      expect(s.summarizeReadTool('navigate_page')).toBe('页面跳转');
      expect(s.summarizeReadTool('unknown_tool')).toBe('执行操作：unknown_tool');
    });

    it('summarizeToolResult 成功/失败/各工具分支', () => {
      const s = aiService as any;
      expect(s.summarizeToolResult('query_events', { success: true, data: [1, 2] })).toBe('查询到 2 个结果');
      expect(s.summarizeToolResult('count_events_by_status', { success: true, data: { total: 5 } })).toBe('共 5 个事件');
      expect(s.summarizeToolResult('count_events_by_status', { success: true, data: {} })).toBe('统计完成');
      expect(s.summarizeToolResult('create_event', { success: true, data: { id: 1 } })).toBe('创建事件成功');
      expect(s.summarizeToolResult('navigate_page', { success: true, data: { description: '设置' } })).toBe('跳转至设置');
      expect(s.summarizeToolResult('x', { success: true, data: {} })).toBe('执行完成');
      expect(s.summarizeToolResult('x', { success: false, error: 'boom' })).toBe('boom');
    });

    it('summarizeWriteTool 写操作摘要分支（确认卡片文案）', () => {
      const s = aiService as any;
      expect(s.summarizeWriteTool('create_event', { title: '评审', startTime: '10:00', endTime: '11:00' })).toBe('创建事件：评审（10:00 至 11:00）');
      expect(s.summarizeWriteTool('create_todo', { title: '周报', dueDate: '2026-08-20' })).toBe('创建待办：周报（截止 2026-08-20）');
      expect(s.summarizeWriteTool('create_todo', { title: '无截止' })).toBe('创建待办：无截止');
      expect(s.summarizeWriteTool('unknown', {})).toBe('执行操作：unknown');
    });

    it('_streamWithProviderFallback：主 provider 未配置回退下一个', async () => {
      mockProviderFactory.getProvider.mockImplementation((name: string) => {
        if (name === 'broken') throw new Error('not configured');
        return mockProvider;
      });
      async function* s() { yield { type: 'text' as const, content: 'ok' }; yield { type: 'done' as const }; }
      mockProvider.stream.mockReturnValue(s());

      const chunks: any[] = [];
      for await (const c of (aiService as any).streamWithProviderFallback({
        chain: ['broken', 'deepseek'],
        messages: [{ role: 'user', content: 'x' }],
        tools: [],
        model: 'm',
      })) {
        chunks.push(c);
      }
      expect(chunks.some((c) => c.type === 'text' && c.content === 'ok')).toBe(true);
      expect(mockProvider.stream).toHaveBeenCalledTimes(1); // 只在 deepseek 上调用
    });

    it('_streamWithProviderFallback：产出内容后遇 error 透传并停止（不回退）', async () => {
      mockProviderFactory.getProvider.mockReturnValue(mockProvider);
      async function* s() {
        yield { type: 'text' as const, content: 'partial' };
        yield { type: 'error' as const, error: 'boom' };
      }
      mockProvider.stream.mockReturnValue(s());

      const chunks: any[] = [];
      for await (const c of (aiService as any).streamWithProviderFallback({
        chain: ['deepseek'],
        messages: [],
        tools: [],
        model: 'm',
      })) {
        chunks.push(c);
      }
      expect(chunks.some((c) => c.type === 'text')).toBe(true);
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(mockProvider.stream).toHaveBeenCalledTimes(1);
    });

    it('listMcpTools：治理策略禁用工具时跳过', async () => {
      (aiService as any).governancePolicy = { isToolEnabled: jest.fn().mockResolvedValue(false) };
      mockToolRegistry.getToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'query_events', description: 'd', parameters: {} } },
      ] as any);
      const tools = await aiService.listMcpTools();
      expect(tools).toEqual([]);
      (aiService as any).governancePolicy = undefined;
    });
  });

  describe('resolveProvider（Fallback 链）', () => {
    it('默认 provider 可用 → 直接返回', () => {
      const r = (aiService as any).resolveProvider({ message: 'hi' });
      expect(r.providerName).toBe('deepseek');
      expect(r.provider).toBe(mockProvider);
    });

    it('主 provider 抛错 → 回退链下一个', () => {
      mockProviderFactory.getProvider.mockImplementation((name: string) => {
        if (name === 'deepseek') throw new Error('not configured');
        return mockProvider;
      });
      const r = (aiService as any).resolveProvider({ message: 'hi', provider: 'deepseek' });
      expect(r.providerName).toBe('qwen');
      expect(r.provider).toBe(mockProvider);
    });

    it('链上全部抛错 → throw 汇总错误', () => {
      mockProviderFactory.getProvider.mockImplementation(() => { throw new Error('down'); });
      expect(() => (aiService as any).resolveProvider({ message: 'hi', provider: 'openai' })).toThrow('No provider available');
    });
  });
});
