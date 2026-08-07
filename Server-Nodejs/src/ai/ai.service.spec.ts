import { AiService } from './ai.service';
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

    const mockAuditService = {
      log: jest.fn(),
      getUserLogs: jest.fn(),
      getStats: jest.fn(),
      getAllStats: jest.fn(),
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
        { log: jest.fn(), getUserLogs: jest.fn(), getStats: jest.fn(), getAllStats: jest.fn() } as any,
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
      // 确认前不执行写操作
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // confirmation_request
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');
      expect(second.value.confirmation?.toolName).toBe('create_event');
      expect(second.value.confirmation?.summary).toContain('创建事件：评审');
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
  });
});
