// SPDX-License-Identifier: Apache-2.0

/**
 * Shared fixture for the AiService specs, so the suite can be split by subdomain without six copies of
 * the same twenty mocks. The bindings are `let` exports: a spec imports the names it uses and calls
 * `installAiServiceTestbed()` in a `beforeEach`, and the live module bindings carry the fresh value into
 * every test body unchanged.
 *
 * AiService 各 spec 的**共享夹具**：按子域拆开套件时，不必把同一批 20 个 mock 抄成六份。绑定是 `let` 导出：
 * 各 spec 按需 import 名字、在 `beforeEach` 里调 `installAiServiceTestbed()`，**ESM 活绑定**把新值带进每个
 * 测试体，测试正文因此一字不改。
 */
import { AiService } from '../src/ai/ai.service';
import { AuthorizationExplainerService } from '../src/ai/authorization-explainer.service';
import { LlmProviderFactory } from '../src/ai/providers/provider-factory';
import { ToolRegistry } from '../src/ai/tools/tool-registry';
import { ToolGateService } from '../src/ai/tools/tool-gate.service';
import { ToolExecutionService } from '../src/ai/tools/tool-execution.service';
import { R4ApprovalService } from '../src/ai/approvals/r4-approval.service';
import { ToolPresentationService } from '../src/ai/tools/tool-presentation.service';
import { ToolExposureService } from '../src/ai/tools/tool-exposure.service';
import { ProviderRoutingService } from '../src/ai/providers/provider-routing.service';
import { ExternalToolRegistry } from '../src/ai/tools/external-tool-registry';
import { ConversationService } from '../src/ai/conversation/conversation.service';
import { ConfirmationStore } from '../src/ai/confirmation/confirmation.store';
import type { AiTool } from '../src/ai/interfaces/tool.interface';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECS_ROOT = resolve(__dirname, '../specs/protocol');

/**
 * A `getTool` stand-in that **satisfies** `AiTool` rather than almost satisfying it.
 *
 * The real registry never returns `undefined`, so a test that stubs it has to hand back a tool body —
 * and what those tests are actually about is one or two flags on it, nearly always
 * `requiresConfirmation`. Spelling the whole interface out at every call site is how half-objects got
 * passed and the type checker flagged them; the shape lives here once, and a call site states only the
 * flag it cares about.
 *
 * `getTool` 的替身，**真的**满足 `AiTool`，而不是「差不多满足」。
 *
 * 真实注册表从不返回 `undefined`，故桩它的测试必须交出工具本体 —— 而那些测试真正关心的只是它上面的
 * 一两个标志，几乎总是 `requiresConfirmation`。在每个调用点把整个接口抄一遍，正是当初传进半截对象、被
 * 类型检查逮住的原因；形状只在这里写一次，调用点只写它关心的那个标志。
 *
 * **只填类型要求的，可选能力一律不预设**（`riskLevel` / `revokeClass` / `permissions` / `audience`）：
 * 那些由被测代码从工具声明**派生**出来，桩若先给一个值，测出来的就是桩而不是那段派生逻辑 —— 这条不是
 * 理论，是第一次写这个助手时踩到的：给 `revokeClass` 垫了 `'none'`，两条断言立刻从
 * `local_compensate` 变成 `none`。
 *
 * Only what the type *requires*; the optional capabilities are left unset. Those are what the code
 * under test **derives** from the tool's declaration, and a stub that pre-fills one turns the
 * assertion into a test of the stub — not theory: the first version of this helper seeded
 * `revokeClass: 'none'` and two assertions flipped from `local_compensate` to `none`.
 */
export function mockTool(over: Partial<AiTool> = {}): AiTool {
  return {
    name: 'mock_tool',
    description: 'mock tool',
    parameters: [],
    toToolDefinition: () => ({
      type: 'function',
      function: { name: 'mock_tool', description: 'mock tool', parameters: {} },
    }),
    execute: async () => ({ success: true }),
    ...over,
  };
}

/**
 * 取 wire 对象的**当前版本** schema（版本以 registry 为准，同 wire-schema.spec.ts 的解析口径）。
 * 绑定测试必须用它而非写死版本目录——否则契约升版（v1→v2 加 impact、v2→v3 加 revokeClass）后
 * 断言会盯着旧版假绿/假红。
 */
export function wiredSchema(objectId: string): {
  $id: string;
  properties: Record<string, unknown>;
  definitions?: Record<string, unknown>;
} {
  const registry = JSON.parse(readFileSync(resolve(SPECS_ROOT, 'wire-schema-registry-v2.json'), 'utf8')) as {
    schemasDir: string;
    objects: Array<{ id: string; version: string; schema: string }>;
  };
  const entry = registry.objects.find((o) => o.id === objectId);
  if (!entry) throw new Error(`registry 缺对象：${objectId}`);
  // v2 的 `schema` 是**文件名**（落在条目自己的版本目录下），故按路径取；别按 `$id` 比对（两者在
  // 这份语料里不总是相等）。/ v2's `schema` is the file name under the entry's own version, so it is
  // read by path rather than matched against `$id`.
  const path = resolve(SPECS_ROOT, registry.schemasDir, entry.version, entry.schema);
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      $id?: string;
      properties?: Record<string, unknown>;
      definitions?: Record<string, unknown>;
    };
    return {
      $id: parsed.$id ?? entry.schema,
      properties: parsed.properties ?? {},
      definitions: parsed.definitions,
    };
  }
  throw new Error(`未找到 ${objectId} 的 schema（registry $id=${entry.schema}，目录 ${entry.version}）`);
}

export let aiService: AiService;
export let mockProviderFactory: jest.Mocked<LlmProviderFactory>;
export let mockToolRegistry: jest.Mocked<ToolRegistry>;
export let mockConversationService: jest.Mocked<ConversationService>;
export let mockRagAgent: { answer: jest.Mock };
export let mockMemoriesService: any;
export let mockSubAgentOrchestrator: any;
export let mockAuthorizationExplainer: any;
export let confirmationStore: ConfirmationStore;
export let mockProvider: jest.Mocked<{
  name: string;
  displayName: string;
  availableModels: string[];
  isOpenAICompatible: jest.Mock;
  generate: jest.Mock;
  stream: jest.Mock;
}>;
export let mockSettingsService: { getAiDailyLimit: jest.Mock; getWithDefault: jest.Mock };
export let mockUsageQuota: { reserveDailyUsage: jest.Mock; releaseDailyUsage: jest.Mock };
export let mockToolGate: ToolGateService;
export let toolExecution: ToolExecutionService;
export let r4Approval: R4ApprovalService;
export let presentation: ToolPresentationService;
export let toolExposure: ToolExposureService;
export let llmRouter: ProviderRoutingService;
export let mockExternalTools: ExternalToolRegistry;
export let mockAuditService: {
  log: jest.Mock;
  getUserLogs: jest.Mock;
  getStats: jest.Mock;
  getAllStats: jest.Mock;
  reserveDailyUsage: jest.Mock;
  releaseDailyUsage: jest.Mock;
};

export const config = {
  defaultProvider: 'deepseek',
  defaultModel: 'deepseek-v4-flash',
  systemPrompt: 'You are a helpful assistant.',
};

export const mockConversation = {
  id: 'conv-1',
  userId: '1',
  messages: [],
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
};
export function installAiServiceTestbed(): void {
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
}
