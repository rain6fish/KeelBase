// SPDX-License-Identifier: Apache-2.0

import { AiService } from './ai.service';
import { AuthorizationExplainerService } from './authorization-explainer.service';
import { NotFoundException } from '@nestjs/common';
import { LlmProviderFactory } from './providers/provider-factory';
import { ToolRegistry } from './tools/tool-registry';
import { ToolGateService } from './tools/tool-gate.service';
import { ToolExecutionService } from './tools/tool-execution.service';
import { R4ApprovalService } from './approvals/r4-approval.service';
import { ToolPresentationService } from './tools/tool-presentation.service';
import { ToolExposureService } from './tools/tool-exposure.service';
import { ProviderRoutingService } from './providers/provider-routing.service';
import { ExternalToolRegistry } from './tools/external-tool-registry';
import { ConversationService } from './conversation/conversation.service';
import { ConfirmationStore } from './confirmation/confirmation.store';
import { StreamChunk } from './interfaces/llm-provider.interface';
import { AuthorizationDeniedError } from './interfaces/tool.interface';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECS_ROOT = resolve(__dirname, '../../specs/protocol');

/**
 * 取 wire 对象的**当前版本** schema（版本以 registry 为准，同 wire-schema.spec.ts 的解析口径）。
 * 绑定测试必须用它而非写死版本目录——否则契约升版（v1→v2 加 impact、v2→v3 加 revokeClass）后
 * 断言会盯着旧版假绿/假红。
 */
function wiredSchema(objectId: string): { $id: string; properties: Record<string, unknown> } {
  const registry = JSON.parse(readFileSync(resolve(SPECS_ROOT, 'wire-schema-registry.json'), 'utf8')) as {
    schemasDir: string;
    objects: Array<{ id: string; version: string; schema: string }>;
  };
  const entry = registry.objects.find((o) => o.id === objectId);
  if (!entry) throw new Error(`registry 缺对象：${objectId}`);
  const dir = resolve(SPECS_ROOT, registry.schemasDir, entry.version);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as {
      $id?: string;
      properties?: Record<string, unknown>;
    };
    if (parsed.$id === entry.schema) return { $id: parsed.$id, properties: parsed.properties ?? {} };
  }
  throw new Error(`未找到 ${objectId} 的 schema（registry $id=${entry.schema}，目录 ${entry.version}）`);
}

describe('AiService', () => {
  let aiService: AiService;
  let mockProviderFactory: jest.Mocked<LlmProviderFactory>;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockRagAgent: { answer: jest.Mock };
  let mockMemoriesService: any;
  let mockSubAgentOrchestrator: any;
  let mockAuthorizationExplainer: any;
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
  let mockUsageQuota: { reserveDailyUsage: jest.Mock; releaseDailyUsage: jest.Mock };
  let mockToolGate: ToolGateService;
  let toolExecution: ToolExecutionService;
  let r4Approval: R4ApprovalService;
  let presentation: ToolPresentationService;
  let toolExposure: ToolExposureService;
  let llmRouter: ProviderRoutingService;
  let mockExternalTools: ExternalToolRegistry;
  let mockAuditService: {
    log: jest.Mock;
    getUserLogs: jest.Mock;
    getStats: jest.Mock;
    getAllStats: jest.Mock;
    reserveDailyUsage: jest.Mock;
    releaseDailyUsage: jest.Mock;
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
    };
    // 工具门控已拆到 ToolGateService（阶段 3「主战场」第一刀）。
    // 这里用**真实实例**而非替身：既有测试是**穿过 chat()** 验门控行为的，mock 掉就丢了被测对象。
    mockExternalTools = new ExternalToolRegistry();
    mockToolGate = new ToolGateService(mockToolRegistry as any, mockExternalTools);
    // 工具执行已拆到 ToolExecutionService（阶段 3「主战场」第二刀）——共享同一 registry/gate 实例，
    // 使穿 chat() 的用例（幂等、读工具）走的仍是同一套被测对象。
    toolExecution = new ToolExecutionService(
      mockToolRegistry as any,
      mockToolGate as any,
      mockExternalTools,
    );
    // R4 审批域（阶段 3 第七刀）：审批生命周期已独立；审批后的执行仍走上面的写管道
    r4Approval = new R4ApprovalService(toolExecution, mockAuditService as any);
    // 呈现/摘要域（阶段 3 第八刀）：确认卡文案 / 影响预览 / 撤销档 / 结果截断已独立
    presentation = new ToolPresentationService(mockToolRegistry as any, toolExecution);
    // 工具对外面（阶段 3 第九刀）：清单 / 指纹 / MCP 出口 / 集成诊断已独立
    toolExposure = new ToolExposureService(mockToolRegistry as any, mockToolGate as any, mockExternalTools);
    // Provider 路由与回退（阶段 3 第六刀）：AiService 的首个协作者由 providerFactory 换成它
    llmRouter = new ProviderRoutingService(mockProviderFactory as any, config.defaultProvider);
    // 每日配额已从 AuditService 拆出（阶段 3 第四刀）
    mockUsageQuota = {
      reserveDailyUsage: jest.fn().mockResolvedValue(true),
      releaseDailyUsage: jest.fn().mockResolvedValue(undefined),
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

    confirmationStore = new ConfirmationStore(
      {
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn((i: unknown) => i),
        update: jest.fn().mockResolvedValue({}),
      } as any,
      5000,
    );

    mockSubAgentOrchestrator = {
      matchSkill: jest.fn().mockReturnValue(null),
      run: jest.fn().mockResolvedValue({ content: '', stepResults: [] }),
    };

    // 真实 explainer（注入 mockToolRegistry：riskLevel 动态 R1，测试可覆写 R3）——
    // 热路径 getAuthorizationReasons 产出真实 user_scoped / risk_policy checks，供工具事件断言
    mockAuthorizationExplainer = new AuthorizationExplainerService(
      mockToolRegistry as any,
      { explainForTarget: jest.fn().mockReturnValue({ action: 'manage', subject: '', allowed: true, reason: '' }) } as any,
    ) as any;

    aiService = new AiService(
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
      { ensureCompacted: jest.fn().mockImplementation((c: any) => ({ conversation: c })) } as any,
      mockSubAgentOrchestrator as any,
      mockAuthorizationExplainer as any,
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

    it('should record token usage from the stream in the chat audit', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const, usage: { promptTokens: 1200, completionTokens: 34 } };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      for await (const _ of aiService.chatStream('1', { message: 'Hi' })) {
        // drain
      }

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      expect(chatAudit).toBeDefined();
      expect(chatAudit.promptTokens).toBe(1200);
      expect(chatAudit.completionTokens).toBe(34);
    });

    it('should sum token usage across tool rounds', async () => {
      async function* firstRound() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
        yield { type: 'done' as const, usage: { promptTokens: 1000, completionTokens: 20 } };
      }
      async function* secondRound() {
        yield { type: 'text' as const, content: 'Found: Meeting' };
        yield { type: 'done' as const, usage: { promptTokens: 2000, completionTokens: 50 } };
      }
      mockProvider.stream
        .mockReturnValueOnce(firstRound())
        .mockReturnValueOnce(secondRound());
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });

      for await (const _ of aiService.chatStream('1', { message: 'My events' })) {
        // drain
      }

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      // 工具轮次的两次 LLM 调用都要计入——只取最后一轮会漏掉首轮开销
      expect(chatAudit.promptTokens).toBe(3000);
      expect(chatAudit.completionTokens).toBe(70);
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

    it('KB-5: two write tools in one round aggregate into a single run confirmation; approve executes both', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      // getTool 返回工具本体（真实 ToolRegistry 从不返回 undefined）——确认载荷的 revokeClass 由它派生
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const originalCreateRun = confirmationStore.createRun.bind(confirmationStore);
      let runToken: string | undefined;
      jest.spyOn(confirmationStore, 'createRun').mockImplementation(async (userId, items, risk) => {
        const r = await originalCreateRun(userId, items, risk);
        runToken = r.token;
        return r;
      });

      // §4 G1：捕获 run 成员副作用登记，断言 runId 从执行点透传到 record（run 级撤销依赖它精确圈定）
      const recordSpy = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('k'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record: recordSpy,
      };

      const it = aiService.chatStream('1', { message: 'create an event and a todo' });
      // 预扫描聚合：第一个确认事件 = mode:'run'（含 2 items），非两条单条 confirmation
      const first = await it.next();
      expect(first.value.type).toBe('confirmation_request');
      const req = first.value.confirmation;
      expect(req?.mode).toBe('run');
      expect(req?.run?.items).toHaveLength(2);
      expect(req?.run?.riskLevel).toBe('R3');
      // §22.17 ④ 影响预览：批内按对象类型分组（create_event→event、create_todo→todo）
      expect(req?.impact).toEqual({
        actions: 2,
        targets: [
          { resultType: 'event', count: 1 },
          { resultType: 'todo', count: 1 },
        ],
      });

      confirmationStore.resolve(runToken!, '1', 'approve');
      const chunks = [];
      for await (const c of it) chunks.push(c);
      // 两工具都执行；整批只出这一次 confirmation_request（无第二条单条）
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(2);
      expect(chunks.filter((c: any) => c.type === 'confirmation_request')).toHaveLength(0);
      // run 级整体决策关卡先于逐条 decision（spec §2.3）
      expect(
        chunks.some(
          (c: any) =>
            c.type === 'confirmation_decision' &&
            c.confirmationDecision?.mode === 'run' &&
            c.confirmationDecision?.approved,
        ),
      ).toBe(true);
      // ② 绑定：run 聚合确认请求键集 ⊆ confirmation-request **当前契约**（版本随 registry，
      // 升版自动跟随：v1→v2 加 impact、v2→v3 加 revokeClass 都在此生效）
      const cr = wiredSchema('confirmation-request').properties as Record<string, unknown> & {
        run: { properties: { items: { items: { properties: Record<string, unknown> } } } };
      };
      expect(Object.keys(req).filter((k) => !(k in cr))).toEqual([]);
      expect(Object.keys(req.run.items[0]).filter((k) => !(k in cr.run.properties.items.items.properties))).toEqual([]);
      // §22.17 ④ 影响预览 v1.1：撤销口径逐条随载荷（create_event / create_todo 均为确认写 → local_compensate）
      expect((req?.run?.items ?? []).map((i: any) => i.revokeClass)).toEqual([
        'local_compensate',
        'local_compensate',
      ]);

      // ② 绑定：run 决策载荷键集 ⊆ confirmation-decision v2 冻结契约
      const cdProps = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v2/confirmation-decision.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      const decisionChunk = chunks.find((c: any) => c.type === 'confirmation_decision') as
        | { confirmationDecision: Record<string, unknown> }
        | undefined;
      expect(decisionChunk).toBeDefined();
      expect(Object.keys(decisionChunk!.confirmationDecision).filter((k) => !cdProps.includes(k))).toEqual([]);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // §4 G1：两条 run 成员副作用都带 runId = run token（run 级批量撤销据此圈定）
      expect(recordSpy).toHaveBeenCalledTimes(2);
      for (const call of recordSpy.mock.calls) {
        expect(call[0]).toMatchObject({ runId: runToken });
      }
      (toolExecution as any).toolEffectsService = undefined;
    });

    /**
     * ARC-5：run 行的目的地绑定。
     *
     * 登记现状说 run 行**不存 audience**，故跨请求路径上该检查「不成文地失效」。核过 HEAD：**run 行没有跨请求
     * 执行路径** —— 两个跨请求裁决入口都明确拒绝 run（`decideApproval`「run confirmation cannot be decided via
     * approval endpoint」／`decideOutOfBand`「…out of band」），治理台回调走的也是前者。⇒ run 成员**只在签发它的
     * 那次请求内执行**，而那次请求里每个成员各自带着自己的目的地（见 `_collectRunCandidates` → `runState.audiences`）。
     *
     * 本用例钉的就是这条边界**确实成立且是真的在检查**：让工具在**签发之后、执行之前**被改指，
     * 本次执行必须被拒。旧实现里 run 成员根本不带目的地 ⇒ 会照常执行（对旧实现为红）。
     */
    it('ARC-5: run 成员在签发请求内执行，且**目的地绑定可达**——签发后工具被改指 → 执行被拒', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      // 签发时：该工具的目标是 legacy-erp
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true, audience: 'legacy-erp' });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const originalCreateRun = confirmationStore.createRun.bind(confirmationStore);
      let runToken: string | undefined;
      jest.spyOn(confirmationStore, 'createRun').mockImplementation(async (userId, items, risk) => {
        const r = await originalCreateRun(userId, items, risk);
        runToken = r.token;
        return r;
      });

      const it = aiService.chatStream('1', { message: 'create an event and a todo' });
      const first = await it.next();
      expect(first.value.type).toBe('confirmation_request');
      expect((first.value as { confirmation?: { mode?: string } }).confirmation?.mode).toBe('run');

      // 签发之后、执行之前：该工具被改指到另一个目标系统
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true, audience: 'legacy-crm' });
      confirmationStore.resolve(runToken!, '1', 'approve');
      const chunks: any[] = [];
      for await (const c of it) chunks.push(c);

      // 两个成员的目标都变了 ⇒ 都不执行
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      // 拒绝理由在流里可见（Explainable Authz），且指的就是这条检查
      const denied = chunks.find((c: any) => c.toolEnd?.authorizationDenied);
      expect(denied?.toolEnd.authorizationDenied.checks).toEqual([
        expect.objectContaining({ name: 'destination_binding', ok: false }),
      ]);
    });

    it('KB-5 修复：预扫描遇未注册工具名（LLM 幻觉 / 外部 mcp_*）不中断整条 SSE 流，降级继续', async () => {
      async function* mockStreamWithPhantom() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'hallucinated_tool', arguments: '{}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithPhantom())
        .mockReturnValueOnce(mockStreamAfterTool());
      // 未注册工具名：registry 抛（与真实 ToolRegistry.getTool 同语义）
      const notFound = (name: string): never => {
        throw new Error(`Tool "${name}" not found`);
      };
      mockToolRegistry.requiresConfirmation.mockImplementation((name: string) => {
        if (name === 'hallucinated_tool') notFound(name);
        return true;
      });
      mockToolRegistry.riskLevel.mockImplementation((name: string) => {
        if (name === 'hallucinated_tool') notFound(name);
        return 'R3';
      });

      const chunks: any[] = [];
      // 修复前：预扫描裸调用抛异常 → 逸出 chatStream → 控制器以 Internal stream error 终止流（无 done）
      for await (const c of aiService.chatStream('1', { message: 'phantom' })) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // 未注册工具不并入 run（无 run 级 confirmation_request）
      expect(
        chunks.some((c: any) => c.type === 'confirmation_request' && c.confirmation?.mode === 'run'),
      ).toBe(false);
    });

    it('KB-5 修复：run 超时如实回放为「超时未确认」（不塌缩成用户 decline）', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
      // run 决策以 timeout 结束（TTL 到期）
      jest.spyOn(confirmationStore, 'createRun').mockResolvedValue({
        token: 'run-timeout',
        decision: Promise.resolve({ outcome: 'timeout' } as never),
      });

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'x' })) chunks.push(c);
      const toolEnds = chunks.filter((c: any) => c.type === 'tool_end');
      expect(toolEnds).toHaveLength(2);
      // 修复前 outcome 被塌缩为 'decline' → 此处会是「操作已取消」
      expect(toolEnds.map((c: any) => c.toolEnd.summary)).toEqual(['操作超时未确认', '操作超时未确认']);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
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
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true });
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { id: 42, title: '评审' },
      });

      // spy create 以拿到 token
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
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
      // §22.17 ④ 影响预览：单条确认也带影响描述符（create_event → event ×1）
      expect(second.value.confirmation?.impact).toEqual({
        actions: 1,
        targets: [{ resultType: 'event', count: 1 }],
      });
      // §22.17 ④ 影响预览 v1.1：单条确认也带撤销口径（create_event → 确认写 → local_compensate）
      expect(second.value.confirmation?.revokeClass).toBe('local_compensate');
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
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true });

      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
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

      // FIX-A 回归：拒绝/未执行的写工具 tool_call 审计行不带「放行快照」——
      // 否则 isError+authorization 非空会被 A-8 denied 视图与 blocked 聚合误判为越权/阻断
      const declinedAudit = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c: any[]) => c[0].action === 'tool_call' && c[0].detail?.startsWith('create_event'),
      );
      expect(declinedAudit).toBeDefined();
      expect(declinedAudit![0].isError).toBe(true);
      expect(declinedAudit![0].errorMessage).toBe('User declined the operation');
      expect(declinedAudit![0].authorization).toBeUndefined();
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

    it('T5 流式 deny：tool_end 透出 authorizationDenied + 审计 authorization 序列化 reasons + proxy 标 source=bridge', async () => {
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
      // proxy 工具 deny：对齐非流式 deny 与成功分支，审计 source=bridge
      jest.spyOn(toolExecution, 'isProxyTool').mockReturnValue(true);
      mockToolRegistry.execute.mockRejectedValue(
        new AuthorizationDeniedError('Tool "query_events" is restricted to roles: admin', [
          { name: 'role_allowed', ok: false, note: '需要角色 [admin]，当前 user' },
        ]),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      // 前端决策轨迹：tool_end.authorizationDenied 带结构化 reasons
      const deniedEnd = chunks.find(
        (c) => c.type === 'tool_end' && (c.toolEnd as { authorizationDenied?: unknown })?.authorizationDenied,
      );
      expect((deniedEnd as any)?.toolEnd?.authorizationDenied?.checks[0].name).toBe('role_allowed');
      // 审计行：isError + authorization 序列化 reasons + proxy 工具 source=bridge
      const denyAudit = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c) => c[0]?.action === 'tool_call' && c[0]?.isError === true,
      );
      expect(denyAudit).toBeDefined();
      expect(denyAudit![0].source).toBe('bridge');
      expect(denyAudit![0].authorization).toBe(
        JSON.stringify([{ name: 'role_allowed', ok: false, note: '需要角色 [admin]，当前 user' }]),
      );
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

      // 导航路径只产出 navigate + text「已为您跳转到设置」+ done，不调用 provider.stream
      expect(mockProvider.stream).not.toHaveBeenCalled();
      const navChunk = chunks.find((c) => c.type === 'navigate');
      expect(navChunk?.route).toBe('/settings');
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

  describe('RG-2.1 AI 每日限额（原子预留）', () => {
    it('limit=0（不限）时正常放行且不预留', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(0);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockProvider.generate).toHaveBeenCalled();
      expect(mockUsageQuota.reserveDailyUsage).not.toHaveBeenCalled();
    });

    it('limit>0 且预留成功时放行（成功保留不计额外自增）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockUsageQuota.reserveDailyUsage).toHaveBeenCalledWith('1', 10);
      expect(mockUsageQuota.releaseDailyUsage).not.toHaveBeenCalled();
    });

    it('limit>0 且已达上限（预留失败）时抛 AI_DAILY_LIMIT', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(false);

      await expect(aiService.chat('1', { message: 'hi' }))
        .rejects.toMatchObject({ errorCode: 'AI_DAILY_LIMIT' });
      expect(mockProvider.generate).not.toHaveBeenCalled();
    });

    it('对话失败时释放预留槽（不占当日额度）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      mockProvider.generate.mockRejectedValue(new Error('provider down'));

      await expect(aiService.chat('1', { message: 'hi' }))
        .rejects.toMatchObject({ errorCode: 'LLM_UNAVAILABLE' });
      expect(mockUsageQuota.releaseDailyUsage).toHaveBeenCalledWith('1');
    });

    it('流式 chatStream 同样校验限额', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(5);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(false);

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'hi' })) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(mockProvider.stream).not.toHaveBeenCalled();
    });

    it('流式 provider 失败：转 error chunk + done，释放预留（零 token 失败不计入用量）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(5);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      // stream 首块即抛错 → streamWithProviderFallback 内部转 error chunk + done（不抛给调用方）
      mockProvider.stream.mockImplementation(() =>
        (async function* () {
          throw new Error('stream down');
        })(),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'hi' })) chunks.push(chunk);

      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // 流式零 token 失败释放预留槽（对齐非流式 chat 失败语义），防误计入当日用量误拦
      expect(mockUsageQuota.releaseDailyUsage).toHaveBeenCalled();
    });

    it('未注入 SettingsService 时跳过限额', async () => {
      // 构造一个不带 settingsService 的 AiService
      const bare = new AiService(
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
        { ensureCompacted: jest.fn().mockImplementation((c: any) => ({ conversation: c })) } as any,
        mockSubAgentOrchestrator as any,
        mockAuthorizationExplainer as any,
      );
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(bare.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockUsageQuota.reserveDailyUsage).not.toHaveBeenCalled();
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

    it('System AI Assistant：ChatRequest.systemPrompt 覆盖 Settings/默认', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue('Settings 里的自定义提示词');
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi', systemPrompt: 'ADMIN_PROMPT' });

      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      // 覆盖优先于 Settings 与默认
      expect(sent.messages[0].content).toBe('ADMIN_PROMPT');
    });
  });

  describe('System AI Assistant（adminMode / adminOnly / 拒绝透传）', () => {
    it('adminMode=true：关闭关键词导航短路，导航交 LLM（不返回 Flutter 路由）', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      const result = await aiService.chat('1', {
        message: '打开设置',
        adminMode: true,
      });

      // 未短路 → 走 LLM（provider 被调用），不返回 /settings
      expect(mockProvider.generate).toHaveBeenCalled();
      expect(result.navigateTo).toBeUndefined();
      expect(result.reply).toBe('ok');
    });

    it('非 adminMode：导航关键词短路仍生效（回归守卫）', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'should not be used' });

      const result = await aiService.chat('1', { message: '打开设置' });

      expect(mockProvider.generate).not.toHaveBeenCalled();
      expect(result.navigateTo).toBe('/settings');
    });

    it('adminOnly 工具：非管理员（普通用户）调用被结构化拒绝', async () => {
      (aiService as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ id: 5, role: 'user' }),
      };
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      await aiService.chat('5', { message: '打开系统信息页' });

      // 非流式 runToolLoop 透传结构化拒绝原因（W5-⑦），LLM 能看到「为何阻止」
      const sent = mockProvider.generate.mock.calls[1][0];
      const toolMsg = sent.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      const parsed = JSON.parse(toolMsg.content);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('admin-only');
      expect(parsed.reasons).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'admin_only', ok: false })]),
      );
    });

    it('adminOnly 工具：系统账号（userId 0）放行', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { navigateTo: '/system' },
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      const result = await aiService.chat('0', { message: '打开系统信息页' });

      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        'navigate_admin_page',
        { page: 'system' },
        '0',
      );
      expect(result.navigateTo).toBe('/system');
    });

    it('adminOnly 工具：真实管理员（role=admin）放行', async () => {
      (mockToolGate as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ id: 5, role: 'admin' }),
      };
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { navigateTo: '/system' },
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      const result = await aiService.chat('5', { message: '打开系统信息页' });

      expect(result.navigateTo).toBe('/system');
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
      toolExposure.registerExternalToolProvider(provider as any);
    });

    it('外部写工具 → 走到确认卡（不再以「执行失败」收尾）', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      provider.callTool.mockResolvedValue({ executed: true, content: 'sent' });
      async function* mockStreamWithExternalWrite() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'mcp_wx_send_email', arguments: '{"to":"a@b.c"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '已提交外部写入' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithExternalWrite())
        .mockReturnValueOnce(mockStreamAfterTool());
      // 忠实模拟真实注册表：外部名不在本地注册表 → getTool / riskLevel 均抛（修前正是在此处打挂确认流）
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_send_email" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_send_email" not found');
      });

      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const it = aiService.chatStream('1', { message: 'send an email through the mcp server' });
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      expect(first.value.toolStart?.name).toBe('mcp_wx_send_email');
      expect(first.value.toolStart?.isWrite).toBe(true);
      // 核心断言：确认卡到达（修前此处是 tool_end「执行失败」）
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');
      expect(second.value.confirmation?.toolName).toBe('mcp_wx_send_email');
      // 档位由外部判定派生：确认写 → R3（走即时确认，不是 R4 审批）
      expect(second.value.confirmation?.authorization?.riskLevel).toBe('R3');
      // P1 起外部 MCP 写**可解析**为 `external_call`（为幂等而登记锚行的同一判据）⇒ 影响面如实给出 1 个外部调用。
      // 原先断言这里是 undefined，其前提是「解析不到」（writeEffectTypeFor 对 mcp_* 返回 null）——前提已变；
      // 且代理写（proxy_call）本就出现在影响预览里，同类事物不应一个显示一个隐藏（docs/impact-preview.spec.md 单一真源）。
      expect(second.value.confirmation?.impact).toEqual({
        actions: 1,
        targets: [{ resultType: 'external_call', count: 1 }],
      });
      // 撤销档仍解析不到（工具未注册 → 不补默认）：外部 MCP **不可撤**，与「不制造可撤销假象」一致。
      expect('revokeClass' in (second.value.confirmation ?? {})).toBe(false);

      // 批准 → 经 provider 执行（外部写走 callTool，不落本地副作用）
      confirmationStore.resolve(pendingToken!, '1', 'approve');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(true);
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_send_email', { to: 'a@b.c' }, '1');
    });

    it('外部读工具在流式对话里正常完成（tool_start + 成功 tool_end）', async () => {
      provider.requiresConfirmation.mockResolvedValue(false);
      provider.callTool.mockResolvedValue({ executed: true, content: '晴 26°C' });
      async function* mockStreamWithExternalRead() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'mcp_wx_get_weather', arguments: '{"city":"sz"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '查询完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithExternalRead())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'weather please' })) chunks.push(c);
      const types = chunks.map((c) => c.type);
      expect(types[0]).toBe('tool_start');
      expect(types).not.toContain('confirmation_request'); // 读工具无需确认
      const end = chunks.find((c) => c.type === 'tool_end');
      expect(end?.toolEnd?.success).toBe(true);
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_get_weather', { city: 'sz' }, '1');
    });

    it('未注册且非外部的写工具仍失败——不给幻觉名发确认卡（边界不放宽）', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      async function* mockStreamWithPhantomWrite() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'hallucinated_write', arguments: '{}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithPhantomWrite())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "hallucinated_write" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "hallucinated_write" not found');
      });
      // isExternal → false（provider 只认 mcp_ 前缀）→ 容错不适用，仍抛
      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'phantom' })) chunks.push(c);
      expect(chunks.map((c) => c.type)).not.toContain('confirmation_request');
      expect(chunks.find((c) => c.type === 'tool_end')?.toolEnd?.success).toBe(false);
    });

    it('外部读工具 → 经 provider 执行并返回文本', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: '晴 26°C' });
      const result = await toolExecution.executeRead('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('晴 26°C');
    });

    it('内置读工具仍走 toolRegistry', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 1 } });
      const result = await toolExecution.executeRead('query_events', {}, '1');
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', {}, '1');
      expect(result.data).toEqual({ total: 1 });
    });

    it('外部写工具确认规则委托 provider', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      await expect(mockToolGate.requiresConfirmation('mcp_wx_send_email')).resolves.toBe(true);
      expect(provider.requiresConfirmation).toHaveBeenCalledWith('mcp_wx_send_email');
    });

    it('外部写工具经 executeWrite 执行（跳过幂等/副作用）', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: 'sent' });
      const result = await toolExecution.executeWrite('mcp_wx_send_email', { to: 'a' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('sent');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('外部 provider 调用失败 → success false + error', async () => {
      provider.callTool.mockResolvedValue({ executed: false, error: 'remote down' });
      const result = await toolExecution.executeRead('mcp_wx_get_weather', {}, '1');
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
  });

  describe('工具摘要与流式回退', () => {

  });
});
