/**
 * AI 对话编排服务
 *
 * 核心编排层：整合 Provider 调用、工具执行、对话管理。
 * 处理多轮工具调用循环、Fallback 机制、对话保存。
 */

import { LlmProviderFactory } from './providers/provider-factory';
import { ToolRegistry } from './tools/tool-registry';
import { ConversationService } from './conversation/conversation.service';
import { AuditService } from './audit/audit.service';
import { RouterAgent } from './agents/router-agent.service';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { ReflectionAgent } from './agents/reflection-agent.service';
import { tracer, withSpan } from '../common/tracing/tracer';
import { SpanStatusCode } from '@opentelemetry/api';
import { PlanExecuteAgent } from './agents/plan-execute-agent.service';
import { RagAgent } from './agents/rag-agent.service';
import { MemoriesService } from './memory/memory.service';
import { ConfirmationStore, ConfirmationOutcome } from './confirmation/confirmation.store';
import { ConversationCompactor } from './conversation/conversation-compactor';
import { SubAgentOrchestrator } from './agents/sub-agent-orchestrator.service';
import {
  AiTool,
  ToolDefinition,
  ToolResult,
  RISK_STRATEGY,
  AuthorizationCheck,
  AuthorizationReasons,
  AuthorizationDeniedError,
} from './interfaces/tool.interface';
import { AiToolEffectsService } from './tool-effects/ai-tool-effects.service';
import { GovernancePolicyService } from './governance/governance-policy.service';
import { ExternalToolProvider, ExternalToolDef } from './external-tool-provider.interface';
import {
  markSystemBoundary,
  sanitizeExternalContent,
  sanitizeMemoryEntry,
} from './security/injection-guard';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { UsersService } from '../users/users.service';
import { NotFoundException } from '@nestjs/common';
import { BusinessException } from '../common/errors/business.exception';
import {
  LlmProvider,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  ChatMessage,
  ToolCall,
} from './interfaces/llm-provider.interface';

const MAX_TOOL_ROUNDS = 5;
const FALLBACK_CHAIN: Record<string, string[]> = {
  deepseek: ['deepseek', 'qwen', 'openai'],
  qwen: ['qwen', 'deepseek', 'openai'],
  openai: ['openai', 'qwen', 'deepseek'],
};

export interface ChatRequest {
  message: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  /** AI-12 多模态：用户消息附带的图片 URL 列表 */
  images?: string[];
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
  /** AI 请求跳转的页面路由（前端收到后执行导航） */
  navigateTo?: string;
  /** 本次对话实际调用的工具名（HS-1 评测断言用） */
  toolCalls?: string[];
}

export interface AiServiceConfig {
  defaultProvider: string;
  defaultModel: string;
  systemPrompt: string;
}

export class AiService {
  private readonly routerAgent = new RouterAgent();
  private readonly reflectionAgent = new ReflectionAgent();
  private readonly planExecuteAgent = new PlanExecuteAgent();

  /** HS-10 Agent 对话集成：外部 MCP 工具提供者（运行时由 McpModule 注入，避免模块循环依赖） */
  private externalToolProvider?: ExternalToolProvider;

  /** HS-10：注入外部工具提供者（McpGatewayService 实现；启动时调用）。 */
  registerExternalToolProvider(provider: ExternalToolProvider): void {
    this.externalToolProvider = provider;
  }

  constructor(
    private readonly providerFactory: LlmProviderFactory,
    private readonly toolRegistry: ToolRegistry,
    private readonly conversationService: ConversationService,
    private readonly config: AiServiceConfig,
    private readonly auditService: AuditService,
    private readonly ragAgent: RagAgent,
    private readonly abilityFactory: CaslAbilityFactory,
    private readonly memoryService: MemoriesService,
    private readonly confirmationStore: ConfirmationStore,
    private readonly compactor: ConversationCompactor,
    private readonly subAgentOrchestrator: SubAgentOrchestrator,
    private readonly settingsService?: SettingsService,
    private readonly featureFlagsService?: FeatureFlagsService,
    private readonly usersService?: UsersService,
    private readonly toolEffectsService?: AiToolEffectsService,
    private readonly governancePolicy?: GovernancePolicyService,
  ) {}

  /**
   * RG-2.1 AI 每日限额：Settings 里 ai_daily_limit（>0 时启用）按用户当日
   * 非错误调用次数拦截。未注入 SettingsService（单测/降级）时跳过。
   */
  private async enforceDailyLimit(userId: string): Promise<void> {
    const settings = this.settingsService;
    if (!settings) return;
    const limit = await settings.getAiDailyLimit();
    if (limit <= 0) return; // 0 = 不限

    const used = await this.auditService.countChatsToday(userId);
    if (used >= limit) {
      throw BusinessException.of('AI_DAILY_LIMIT');
    }
  }

  /** 对话所有权 CASL ability（userId 是 string，sub 转 number；普通 user） */
  private _abilityFor(userId: string) {
    return this.abilityFactory.createForUser({
      sub: Number(userId),
      username: '',
      role: 'user' as any,
    });
  }

  /**
   * HS-2 + HS-9 工具执行前权限门控：按工具声明 + 治理策略检查调用资格。
   * - HS-9 策略开关：工具被策略禁用时拒绝
   * - HS-9 角色白名单：allowedRoles 非空时仅列内角色可调（headless 系统账号由 API Key 鉴权，跳过）
   * - featureFlag：对应特性开关关闭时拒绝（对齐 HTTP 层 @FeatureFlag）
   * - requireVerifiedEmail：写操作需已验证邮箱（对齐 EmailVerificationGuard，admin/headless 视为已验证）
   * 无 permissions 声明的工具视为允许（数据隔离已由 execute 的 userId 保证）。
   */
  private async _assertToolAllowed(
    toolName: string,
    userId: string,
  ): Promise<void> {
    let tool: AiTool | undefined;
    try {
      tool = this.toolRegistry.getTool(toolName);
    } catch {
      // 工具未注册：让后续 execute 抛「not found」，这里不拦截
    }

    // W5 风险模型：R5（不可逆/外部动作）→ 阻断，不进入确认/执行（评审二 §7）
    if (tool && this.toolRegistry.riskLevel(toolName) === 'R5') {
      throw new AuthorizationDeniedError(
        `Tool "${toolName}" is blocked (risk level R5)`,
        [{ name: 'risk_policy', ok: false, note: `风险级 R5（不可逆/外部动作）→ 阻断` }],
      );
    }

    // HS-9 治理策略：工具开关 + 角色白名单
    if (this.governancePolicy) {
      const enabled = await this.governancePolicy.isToolEnabled(toolName);
      if (!enabled) {
        throw new AuthorizationDeniedError(
          `Tool "${toolName}" is disabled by governance policy`,
          [{ name: 'tool_enabled', ok: false, note: '治理策略禁用此工具' }],
        );
      }
      const allowedRoles = await this.governancePolicy.getAllowedRoles(toolName);
      if (allowedRoles.length > 0 && userId !== '0') {
        // A14：角色白名单每次工具调用实时查库取用户——角色降权对下一次工具调用立即生效；
        // 治理策略本身经 SettingsService 缓存提供（写 settings 即失效重载），非持久缓存，
        // 因此「策略降权不生效」的感知来自设置未落库，而非本层缓存。此处不做额外 TTL 缓存。
        const user = this.usersService
          ? await this.usersService.findOne(Number(userId))
          : null;
        if (!user || !user.role || !allowedRoles.includes(user.role)) {
          throw new AuthorizationDeniedError(
            `Tool "${toolName}" is restricted to roles: ${allowedRoles.join(', ')}`,
            [
              {
                name: 'role_allowed',
                ok: false,
                note: `需要角色 [${allowedRoles.join(', ')}]${user ? `，当前 ${user.role ?? '无角色'}` : ''}`,
              },
            ],
          );
        }
      }
    }

    const perms = tool?.permissions;
    if (!perms) return;

    if (
      perms.featureFlag &&
      this.featureFlagsService &&
      !this.featureFlagsService.isEnabled(perms.featureFlag as never)
    ) {
      throw new AuthorizationDeniedError(
        `Tool "${toolName}" is disabled (feature flag "${perms.featureFlag}" off)`,
        [{ name: 'feature_flag', ok: false, note: `特性开关 ${perms.featureFlag} 关闭` }],
      );
    }

    // headless 系统账号（userId '0'）：由 headless 层 API Key 鉴权，不重复拦截
    if (userId === '0') return;

    if (perms.requireVerifiedEmail && this.usersService) {
      const user = await this.usersService.findOne(Number(userId));
      if (user && !user.emailVerified) {
        throw new BusinessException('EMAIL_NOT_VERIFIED');
      }
    }
  }

  /**
   * HS-9 确认规则：治理策略可覆盖工具定义的 requiresConfirmation。
   * HS-10：外部 MCP 工具由 ExternalToolProvider 判定（readOnly 免确认，非只读默认需确认，策略可覆盖）。
   * 未注入 GovernancePolicyService（单测/降级）时沿用工具定义默认。
   */
  private async _requiresConfirmation(name: string): Promise<boolean> {
    if (this.externalToolProvider?.isExternal(name)) {
      return this.externalToolProvider.requiresConfirmation(name);
    }
    const fallback = this.toolRegistry.requiresConfirmation(name);
    if (!this.governancePolicy) return fallback;
    return this.governancePolicy.requiresConfirmation(name, fallback);
  }

  /**
   * W5-⑦ Explainable Authorization（评审四）：生成「为何允许 / 为何需确认」的结构化依据。
   * 由 tool_start / confirmation_request 事件携带，供前端渲染治理可解释性。
   * 调用时机在 _assertToolAllowed 之后，故 tool_enabled / role_allowed 反映已生效的门控。
   */
  private async _authorizationReasons(
    toolName: string,
    userId: string,
    isWrite: boolean,
  ): Promise<AuthorizationReasons> {
    const riskLevel = this.toolRegistry.riskLevel(toolName);
    const riskStrategy = RISK_STRATEGY[riskLevel];
    const checks: AuthorizationCheck[] = [];
    if (this.governancePolicy) {
      const enabled = await this.governancePolicy.isToolEnabled(toolName);
      checks.push({
        name: 'tool_enabled',
        ok: enabled,
        note: enabled ? '治理策略已启用' : '治理策略禁用',
      });
      const roles = await this.governancePolicy.getAllowedRoles(toolName);
      if (roles.length > 0) {
        const user = this.usersService
          ? await this.usersService.findOne(Number(userId))
          : null;
        const ok = !!user && !!user.role && roles.includes(user.role);
        checks.push({
          name: 'role_allowed',
          ok,
          note: ok
            ? `角色 ${user.role} ∈ [${roles.join(', ')}]`
            : `需要角色 [${roles.join(', ')}]`,
        });
      } else {
        checks.push({ name: 'role_allowed', ok: true, note: '无角色限制' });
      }
    }
    checks.push({
      name: 'user_scoped',
      ok: true,
      note: '执行时注入调用者 userId，仅操作本人数据',
    });
    checks.push({
      name: 'risk_policy',
      ok: isWrite,
      note: `风险级 ${riskLevel}（${riskStrategy}）${isWrite ? '→ 需人工确认' : '→ 自动执行'}`,
    });
    return {
      tool: toolName,
      riskLevel,
      riskStrategy,
      requiresConfirmation: isWrite,
      checks,
    };
  }

  /**
   * HS-10：内置 + 外部工具定义合并（供 LLM 工具流）。外部工具发现失败静默降级为内置。
   */
  private async _buildToolDefs(): Promise<ToolDefinition[]> {
    const builtin = this.toolRegistry.getToolDefinitions();
    if (!this.externalToolProvider) return builtin;
    try {
      const external: ExternalToolDef[] = await this.externalToolProvider.listExternalTools();
      if (external.length === 0) return builtin;
      return [
        ...builtin,
        ...external.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      ];
    } catch {
      return builtin;
    }
  }

  /** HS-10：读工具执行（内置走 toolRegistry，外部走 provider）。 */
  private async _executeReadTool(
    name: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    if (this.externalToolProvider?.isExternal(name)) {
      const out = await this.externalToolProvider.callTool(name, args, userId);
      if (!out.executed) {
        return { success: false, error: out.error ?? 'External tool call failed' };
      }
      return { success: true, data: out.content ?? {} };
    }
    return this.toolRegistry.execute(name, args, userId);
  }

  /**
   * HS-9 审计粒度：all = 记对话+工具；write = 只记工具调用；off = 不记。
   */
  private async _shouldAudit(scope: 'conversation' | 'tool'): Promise<boolean> {
    if (!this.governancePolicy) return true;
    const granularity = await this.governancePolicy.getAuditGranularity();
    if (granularity === 'off') return false;
    if (granularity === 'write') return scope === 'tool';
    return true;
  }

  /**
   * HS-3 写工具执行（幂等 + 副作用记录）：
   * - 同会话同工具同参数重复调用返回已有结果（防 LLM 重试/并发重复创建）
   * - 成功后记录副作用（resultType/resultId），管理台可软删撤销（衔接 RG-3）
   * toolEffectsService 未注入（单测/降级）时直接执行，跳过幂等。
   * HS-10：外部 MCP 写工具经 provider 执行（跳过幂等/副作用——外部工具不创建 KeelBase 实体）。
   */
  private async _executeWriteTool(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    conversationId?: string,
  ): Promise<ToolResult> {
    if (this.externalToolProvider?.isExternal(toolName)) {
      const out = await this.externalToolProvider.callTool(toolName, args, userId);
      if (!out.executed) {
        return { success: false, error: out.error ?? 'External tool call failed' };
      }
      return { success: true, data: out.content ?? {} };
    }
    if (!this.toolEffectsService) {
      return this.toolRegistry.execute(toolName, args, userId);
    }
    const key = AiToolEffectsService.buildKey({
      userId,
      conversationId,
      toolName,
      args,
    });
    const existing = await this.toolEffectsService.findExisting(key);
    if (existing.existing && existing.effect) {
      return {
        success: true,
        data: {
          id: existing.effect.resultId,
          idempotent: true,
        },
      };
    }
    const result = await this.toolRegistry.execute(toolName, args, userId);
    if (result.success && result.data && (result.data as any).id !== undefined) {
      // 状态变更型写工具（AI 预审）不创建可撤销记录，仅确认 + 审计
      if (toolName !== 'review_approval_request') {
        // AI 旗舰应用：写工具 → 对应实体 resultType（撤销走软删）
        const resultType =
          toolName === 'create_event'
            ? 'event'
            : toolName === 'create_followup_task'
              ? 'crm_task'
              : toolName === 'create_project_task'
                ? 'pm_task'
                : toolName === 'submit_approval_request'
                  ? 'app_request'
                  : 'todo';
        await this.toolEffectsService.record(
          { userId, conversationId, toolName, args },
          resultType,
          (result.data as any).id,
        );
      }
    }
    return result;
  }

  /**
   * HS-10 MCP 出口：现有工具暴露为 MCP 工具（尊重治理策略 enabled 开关）。
   */
  async listMcpTools(): Promise<
    Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  > {
    const defs = this.toolRegistry.getToolDefinitions();
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }> = [];
    for (const d of defs) {
      const name = d.function.name;
      if (this.governancePolicy && !(await this.governancePolicy.isToolEnabled(name))) {
        continue;
      }
      tools.push({
        name,
        description: d.function.description,
        inputSchema: d.function.parameters as Record<string, unknown>,
      });
    }
    return tools;
  }

  /**
   * HS-10 MCP 出口执行入口：过同一治理层（权限门控 → 确认规则 → 执行）。
   * - 读工具：直接执行（权限通过后）
   * - 写工具（requiresConfirmation）：不自动执行，返回需确认信号，由调用方处理
   */
  async executeToolForExternal(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<{ executed: boolean; requiresConfirmation: boolean; result?: ToolResult }> {
    await this._assertToolAllowed(toolName, userId);
    if (await this._requiresConfirmation(toolName)) {
      return { executed: false, requiresConfirmation: true };
    }
    return {
      executed: true,
      requiresConfirmation: false,
      result: await this.toolRegistry.execute(toolName, args, userId),
    };
  }

  /**
   * HS-2 + HS-9 工具清单（管理台可见）：名称/描述/参数/权限/是否需确认。
   * 供 GET /ai/tools（admin）展示工具与权限，便于审计与治理。
   * HS-9：反映治理策略实际生效的开关/确认规则。
   */
  async getToolInventory() {
    const policy = this.governancePolicy
      ? await this.governancePolicy.getPolicy()
      : null;
    const tools = policy?.tools ?? {};
    return this.toolRegistry.getAllTools().map((tool) => {
      const override = tools[tool.name] ?? {};
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
        })),
        enabled: override.enabled ?? true,
        requiresConfirmation:
          override.requiresConfirmation ?? tool.requiresConfirmation ?? false,
        allowedRoles: override.allowedRoles ?? [],
        permissions: tool.permissions ?? null,
        riskLevel: this.toolRegistry.riskLevel(tool.name),
        riskStrategy: RISK_STRATEGY[this.toolRegistry.riskLevel(tool.name)],
      };
    });
  }

  /**
   * 非流式对话：发送消息，处理工具调用，返回完整回复
   */
  async chat(
    userId: string,
    request: ChatRequest,
  ): Promise<ChatResponse> {
    await this.enforceDailyLimit(userId);
    return withSpan('ai.chat', async () => {
      return this.chatImpl(userId, request);
    }, {
      'ai.user_id': userId,
      'ai.provider': request.provider,
      'ai.model': request.model,
    });
  }

  /** chat 实际实现（被 chat 的业务 span 包装；拆分便于单独加 span 而不影响外部调用方） */
  private async chatImpl(
    userId: string,
    request: ChatRequest,
  ): Promise<ChatResponse> {
    const { conversation, providerName, provider } =
      this.resolveProvider(request);

    let conversationId: string;
    if (request.conversationId) {
      // 如果会话不存在（如服务器重启导致内存清空），自动创建新会话
      try {
        await this.conversationService.getConversation(request.conversationId, userId, this._abilityFor(userId));
        conversationId = request.conversationId;
      } catch (e) {
        // CR-27：仅「会话不存在」时自动新建；越权（Forbidden）等错误放行，不吞
        if (!(e instanceof NotFoundException)) throw e;
        const conv = await this.conversationService.createConversation(
          userId,
          providerName,
          request.model ?? this.config.defaultModel,
        );
        conversationId = conv.id;
      }
    } else {
      const conv = await this.conversationService.createConversation(
        userId,
        providerName,
        request.model ?? this.config.defaultModel,
      );
      conversationId = conv.id;
    }

    // Append user message
    await this.conversationService.appendMessage(conversationId, {
      role: 'user',
      content: request.message,
    });

    // 意图路由（Router Agent）：分类用户意图
    // Skill 短路：技能命中（且非写/导航请求）→ 直接委托子代理，零 LLM 成本
    const actionVerbs = ['创建', '新增', '添加', '删除', '编辑', '修改', '取消'];
    const isActionRequest = actionVerbs.some((v) => request.message.includes(v));
    const matchedSkill = !isActionRequest
      ? this.subAgentOrchestrator.matchSkill(request.message)
      : null;
    const hasNav = this.detectNavigation(request.message) !== null;
    const intent =
      matchedSkill && !hasNav
        ? ('delegate' as const)
        : await this.routerAgent.classify(
            request.message,
            provider,
            request.model ?? this.config.defaultModel,
          );

    let finalContent: string;
    let usage: { promptTokens: number; completionTokens: number } | undefined;
    let navigateTo: string | undefined;
    let toolCalls: string[] | undefined;

    if (intent === 'navigate') {
      // 导航请求 — 关键词匹配，不走 LLM
      const navResult = this.detectNavigation(request.message);
      if (navResult) {
        await this.conversationService.appendMessage(conversationId, {
          role: 'assistant',
          content: navResult.reply,
        });
        return {
          conversationId,
          reply: navResult.reply,
          provider: providerName,
          model: request.model ?? this.config.defaultModel,
          navigateTo: navResult.route,
        };
      }
    }

    if (intent === 'knowledge') {
      // 知识库问答 — RAG 检索增强
      const messages = await this.buildMessages(conversationId, request.images);
      const ragResult = await this.ragAgent.answer(
        messages,
        request.message,
        provider,
        request.model ?? this.config.defaultModel,
      );

      await this.conversationService.appendMessage(conversationId, {
        role: 'assistant',
        content: ragResult.content,
      });

      // 审计日志（HS-9 粒度门控：conversation 级仅 all 时记录）
      if (await this._shouldAudit('conversation')) {
        this.auditService.log({
          userId,
          conversationId,
          action: 'knowledge',
          provider: providerName,
          model: request.model ?? this.config.defaultModel,
        });
      }
      // A2：每日限额计数独立于审计粒度，成功对话必然自增（审计 off/write 不影响限额）
      await this.auditService.incrementDailyUsage(userId);

      return {
        conversationId,
        reply: ragResult.content,
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
      };
    }

    if (intent === 'delegate') {
      // 子代理委托：分解为子代理任务顺序执行，聚合后总结 + 反思
      const messages = await this.buildMessages(conversationId, request.images);
      const delegateResult = await this.subAgentOrchestrator.run({
        messages,
        userRequest: request.message,
        provider,
        toolRegistry: this.toolRegistry,
        userId,
        model: request.model ?? this.config.defaultModel,
      });

      if (delegateResult.stepResults.length > 0) {
        // 用 LLM 汇总子代理结果
        const summary = await provider.generate({
          messages: [
            ...messages.slice(0, 1), // system prompt
            { role: 'user', content: request.message },
            {
              role: 'assistant',
              content: `以下是各子代理的执行结果：\n${delegateResult.content}\n请综合这些信息回答用户。`,
            },
          ],
          model: request.model ?? this.config.defaultModel,
        });
        finalContent = summary.content;

        // Reflection：自我改进
        finalContent = await this.reflectionAgent.reflect(
          [
            ...messages.slice(0, 1),
            { role: 'user', content: request.message },
          ],
          finalContent,
          provider,
          request.model ?? this.config.defaultModel,
        );
        usage = summary.usage;
      } else {
        // 委托失败（分解/全部任务无效）→ 回退标准工具循环
        const fallbackResult = await this.runToolLoop({
          provider,
          providerName,
          conversationId,
          userId,
          model: request.model ?? this.config.defaultModel,
          initialToolDefs: await this._buildToolDefs(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
          images: request.images,
        });
        finalContent = fallbackResult.finalContent;
        usage = fallbackResult.usage;
        navigateTo = fallbackResult.navigateTo;
        toolCalls = fallbackResult.toolCalls;
      }
    } else if (intent === 'analyze' || intent === 'plan') {
      // Plan-and-Execute：多步推理
      const messages = await this.buildMessages(conversationId, request.images);
      const planResult = await this.planExecuteAgent.planAndExecute(
        messages,
        provider,
        this.toolRegistry,
        userId,
        request.model ?? this.config.defaultModel,
      );

      if (planResult.stepResults.length > 0) {
        // 用 LLM 汇总步骤结果
        const summary = await provider.generate({
          messages: [
            ...messages.slice(0, 1), // system prompt
            { role: 'user', content: request.message },
            {
              role: 'assistant',
              content: `以下是数据查询结果：\n${planResult.content}\n请根据这些信息回答用户。`,
            },
          ],
          model: request.model ?? this.config.defaultModel,
        });
        finalContent = summary.content;

        // Reflection：自我改进
        finalContent = await this.reflectionAgent.reflect(
          [
            ...messages.slice(0, 1),
            { role: 'user', content: request.message },
          ],
          finalContent,
          provider,
          request.model ?? this.config.defaultModel,
        );
        usage = summary.usage;
      } else {
        // Plan failed, fallback to normal tool loop
        const fallbackResult = await this.runToolLoop({
          provider,
          providerName,
          conversationId,
          userId,
          model: request.model ?? this.config.defaultModel,
          initialToolDefs: await this._buildToolDefs(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
          images: request.images,
        });
        finalContent = fallbackResult.finalContent;
        usage = fallbackResult.usage;
        navigateTo = fallbackResult.navigateTo;
        toolCalls = fallbackResult.toolCalls;
      }
    } else {
      // 默认：标准 Tool Loop
      const toolResult = await this.runToolLoop({
        provider,
        providerName,
        conversationId,
        userId,
        model: request.model ?? this.config.defaultModel,
        initialToolDefs: await this._buildToolDefs(),
        fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
        images: request.images,
      });
      finalContent = toolResult.finalContent;
      usage = toolResult.usage;
      navigateTo = toolResult.navigateTo;
      toolCalls = toolResult.toolCalls;
    }

    // Append assistant reply
    await this.conversationService.appendMessage(conversationId, {
      role: 'assistant',
      content: finalContent,
    });

    // fire-and-forget：规则式抽取用户记忆，不阻塞对话
    void this.memoryService
      .extractFromTurn(userId, request.message, conversationId)
      .catch(() => {});

    // 审计日志（HS-9 粒度门控：conversation 级仅 all 时记录）
    if (await this._shouldAudit('conversation')) {
      this.auditService.log({
        userId,
        conversationId,
        action: intent === 'delegate' ? 'delegate' : intent === 'plan' ? 'plan' : intent === 'analyze' ? 'analyze' : 'chat',
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
      });
    }
    // A2：每日限额计数独立于审计粒度，成功对话必然自增（审计 off/write 不影响限额）
    await this.auditService.incrementDailyUsage(userId);

    return {
      conversationId,
      reply: finalContent,
      provider: providerName,
      model: request.model ?? this.config.defaultModel,
      usage,
      navigateTo,
      toolCalls,
    };
  }

  /**
   * 流式对话：逐块返回文本和工具调用事件
   */
  async *chatStream(
    userId: string,
    request: ChatRequest,
  ): AsyncIterable<StreamChunk> {
    // RG-2.1：流式路径限额超限 → 转为 error chunk（不抛给迭代器）
    try {
      await this.enforceDailyLimit(userId);
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
      return;
    }
    // 流式 span：外层手动 start/end，避免 async generator 语义问题
    const span = tracer.startSpan('ai.chatStream', {
      attributes: {
        'ai.user_id': userId,
        'ai.provider': request.provider,
        'ai.model': request.model,
      },
    });
    try {
      yield* this.chatStreamImpl(userId, request);
      span.end();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      throw err;
    }
  }

  private async *chatStreamImpl(
    userId: string,
    request: ChatRequest,
  ): AsyncIterable<StreamChunk> {
    // HS-6：本次会话内被用户信任的写工具（确认时勾选「本会话免确认」后加入）
    const trustedTools = new Set<string>();
    const { providerName } = this.resolveProvider(request);
    // CR-28：流式 Fallback 链（首个 chunk 前失败自动切下一个 provider）
    const streamFallbackChain = FALLBACK_CHAIN[providerName] ?? [providerName];

    let conversationId: string;
    if (request.conversationId) {
      // 如果会话不存在（如服务器重启导致内存清空），自动创建新会话
      try {
        await this.conversationService.getConversation(request.conversationId, userId, this._abilityFor(userId));
        conversationId = request.conversationId;
      } catch (e) {
        // CR-27：仅「会话不存在」时自动新建；越权（Forbidden）等错误放行，不吞
        if (!(e instanceof NotFoundException)) throw e;
        const conv = await this.conversationService.createConversation(
          userId,
          providerName,
          request.model ?? this.config.defaultModel,
        );
        conversationId = conv.id;
      }
    } else {
      const conv = await this.conversationService.createConversation(
        userId,
        providerName,
        request.model ?? this.config.defaultModel,
      );
      conversationId = conv.id;
    }

    // Append user message
    await this.conversationService.appendMessage(conversationId, {
      role: 'user',
      content: request.message,
    });

    // 导航意图预检测
    const navResult = this.detectNavigation(request.message);
    if (navResult) {
      await this.conversationService.appendMessage(conversationId, {
        role: 'assistant',
        content: navResult.reply,
      });
      yield { type: 'text', content: navResult.reply };
      yield { type: 'done', conversationId };
      return;
    }

    let messages = await this.buildMessages(conversationId, request.images);
    const model = request.model ?? this.config.defaultModel;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const tools = await this._buildToolDefs();
      const stream = this.streamWithProviderFallback({
        chain: streamFallbackChain,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        model,
      });

      const accumulatedToolCalls = new Map<
        number,
        { id: string; name: string; args: string }
      >();
      let fullText = '';
      let reasoningText = '';
      let streamError: string | undefined;
      let hasToolCalls = false;

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullText += chunk.content;
          yield { type: 'text', content: chunk.content };
        } else if (chunk.type === 'reasoning') {
          reasoningText += chunk.content;
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          hasToolCalls = true;
          const idx = chunk.toolCall.index ?? 0;
          const existing = accumulatedToolCalls.get(idx) ?? {
            id: '',
            name: '',
            args: '',
          };
          if (chunk.toolCall.id) existing.id = chunk.toolCall.id;
          if (chunk.toolCall.name) existing.name = chunk.toolCall.name;
          if (chunk.toolCall.arguments) existing.args += chunk.toolCall.arguments;
          accumulatedToolCalls.set(idx, existing);
        } else if (chunk.type === 'error') {
          streamError = chunk.error;
          yield chunk;
        }
        // 'done' — handled after the loop
      }

      if (streamError) {
        await this.conversationService.appendMessage(conversationId, {
          role: 'assistant',
          content: `Error: ${streamError}`,
        });
        yield { type: 'done', conversationId };
        return;
      }

      if (!hasToolCalls && accumulatedToolCalls.size === 0) {
        // Pure text response — done
        await this.conversationService.appendMessage(conversationId, {
          role: 'assistant',
          content: fullText,
        });
        // CR-2：流式主完成审计——否则不进 ai_audit_logs，每日限额可被流式绕过
        // HS-9 粒度门控：conversation 级仅 all 时记录
        if (await this._shouldAudit('conversation')) {
          this.auditService.log({
            userId,
            conversationId,
            action: 'chat',
            provider: providerName,
            model,
          });
        }
        // A2：每日限额计数独立于审计粒度，成功对话必然自增（审计 off/write 不影响限额）
        await this.auditService.incrementDailyUsage(userId);
        // fire-and-forget：规则式抽取用户记忆，不阻塞对话
        void this.memoryService
          .extractFromTurn(userId, request.message, conversationId)
          .catch(() => {});
        yield { type: 'done', conversationId };
        return;
      }

      // 先 push 带 tool_calls 的 assistant 消息（API 要求：tool 消息必须跟在带 tool_calls 的 assistant 消息之后）
      const toolCallsArray = Array.from(accumulatedToolCalls.entries()).map(
        ([idx, tc]) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.args,
          index: idx,
        }),
      );

      if (toolCallsArray.length > 0) {
        messages.push({
          role: 'assistant',
          content: fullText || '',
          tool_calls: toolCallsArray,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
        });
      }

      // Execute accumulated tool calls
      for (const [, tc] of accumulatedToolCalls) {
        let started = false;
        try {
          const parsed = JSON.parse(tc.args);
          // HS-2 工具权限门控（featureFlag / requireVerifiedEmail）— 先于确认流程
          await this._assertToolAllowed(tc.name, userId);
          const isWrite = await this._requiresConfirmation(tc.name);
          started = true;
          // 工具过程可视化：执行前发 tool_start，前端渲染"执行中"卡片
          // ADT（P0-14）：isWrite 让前端标注读/写，写操作需确认、可撤销
          // W5-⑦ Explainable Authz：携带 riskLevel + authorization（为何允许/为何需确认）
          const authz = await this._authorizationReasons(tc.name, userId, isWrite);
          yield {
            type: 'tool_start',
            toolStart: {
              name: tc.name,
              summary: isWrite
                ? this.summarizeWriteTool(tc.name, parsed)
                : this.summarizeReadTool(tc.name),
              arguments: parsed,
              isWrite,
              riskLevel: authz.riskLevel,
              authorization: authz,
            },
          };

          let result: ToolResult;
          if (isWrite) {
            // HS-6：本会话已信任该工具 → 免确认直接执行（统一段会 push 消息 + 审计）
            if (trustedTools.has(tc.name)) {
              result = await this._executeWriteTool(tc.name, parsed, userId, conversationId);
            } else {
              // 写操作：先发 confirmation_request，等待用户确认后才执行
            const ttlSeconds = this.settingsService
              ? Number(
                  await this.settingsService.getWithDefault(
                    SETTING_KEYS.CONFIRMATION_TTL,
                    60,
                  ),
                )
              : 60;
            const { token, decision } = this.confirmationStore.create(
              userId,
              tc.name,
              parsed,
              ttlSeconds * 1000,
            );
            yield {
              type: 'confirmation_request',
              confirmation: {
                token,
                toolName: tc.name,
                summary: this.summarizeWriteTool(tc.name, parsed),
                arguments: parsed,
                // W5-⑦ Explainable Authz：让用户理解「为何此操作需确认」（风险级/策略/检查清单）
                authorization: await this._authorizationReasons(tc.name, userId, true),
              },
            };
            const { outcome, trustTool } = await decision;
            // HS-6：用户勾选「本会话信任此工具」→ 后续免确认
            if (trustTool && outcome === 'approve') {
              trustedTools.add(tc.name);
            }
            // HS-7 确认决策审计：让管理台时间线能展示「AI 请求写操作 → 用户确认/拒绝」
            // HS-9 粒度门控：tool 级在 off 时不记录
            if (await this._shouldAudit('tool')) {
              this.auditService.log({
                userId,
                conversationId,
                action: 'tool_confirmation',
                detail: `${tc.name}(${JSON.stringify(parsed)}) → ${outcome}${trustTool ? ' (trusted)' : ''}`,
                isError: outcome !== 'approve',
                errorMessage: outcome === 'timeout' ? 'User did not respond in time' : outcome === 'decline' ? 'User declined the operation' : undefined,
              });
            }
            if (outcome === 'approve') {
              result = await this._executeWriteTool(tc.name, parsed, userId, conversationId);
              yield {
                type: 'confirmation_decision',
                confirmationDecision: {
                  toolName: tc.name,
                  approved: true,
                  success: result.success,
                  resultId: (result.data as any)?.id,
                  error: result.error,
                },
              };
              yield {
                type: 'tool_end',
                toolEnd: {
                  name: tc.name,
                  success: result.success,
                  summary: this.summarizeToolResult(tc.name, result),
                  error: result.error,
                },
              };
            } else {
              result = {
                success: false,
                error:
                  outcome === 'timeout'
                    ? 'User did not respond in time'
                    : 'User declined the operation',
              };
              yield {
                type: 'confirmation_decision',
                confirmationDecision: { toolName: tc.name, approved: false },
              };
              yield {
                type: 'tool_end',
                toolEnd: {
                  name: tc.name,
                  success: false,
                  summary:
                    outcome === 'timeout' ? '操作超时未确认' : '操作已取消',
                },
              };
            }
            }
          } else {
            result = await this._executeReadTool(tc.name, parsed, userId);
            yield {
              type: 'tool_end',
              toolEnd: {
                name: tc.name,
                success: result.success,
                summary: this.summarizeToolResult(tc.name, result),
                error: result.error,
              },
            };
          }
          messages.push({
            role: 'tool',
            content: this.truncateToolResult(result),
            tool_call_id: tc.id,
          });
          // CR-2：流式工具执行审计（对齐非流式 runToolLoop）
          // HS-9 粒度门控：tool 级在 off 时不记录
          if (await this._shouldAudit('tool')) {
            this.auditService.log({
              userId,
              conversationId,
              action: 'tool_call',
              detail: `${tc.name}(${tc.args})`,
              isError: !result.success,
              errorMessage: result.error,
            });
          }
        } catch (err) {
          // 已发出 tool_start 则补发失败的 tool_end，避免前端悬空"执行中"卡片
          if (started) {
            // W5-⑦ Explainable Authz：授权拒绝透出「为何阻止」（结构化检查清单）
            const denied =
              err instanceof AuthorizationDeniedError
                ? { reason: err.message, checks: err.reasons }
                : undefined;
            yield {
              type: 'tool_end',
              toolEnd: {
                name: tc.name,
                success: false,
                summary: denied ? '工具被拒绝' : '工具执行失败',
                error: denied ? denied.reason : 'Tool execution failed',
                authorizationDenied: denied,
              },
            };
          }
          // If the tool call couldn't be fully reconstructed or executed,
          // add an error result
          const deniedMsg =
            err instanceof AuthorizationDeniedError
              ? err.message
              : 'Tool execution failed';
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: deniedMsg }),
            tool_call_id: tc.id,
          });
          // CR-2：流式工具执行失败审计
          // HS-9 粒度门控：tool 级在 off 时不记录
          // W5-⑦ Explainable Authz：拒绝时记录真实原因（决策轨迹展示「为何阻止」）
          if (await this._shouldAudit('tool')) {
            this.auditService.log({
              userId,
              conversationId,
              action: 'tool_call',
              detail: `${tc.name}(${tc.args})`,
              isError: true,
              errorMessage: deniedMsg,
            });
          }
        }
      }

      // If we have text but no tool calls, add it as an assistant message
      if (!hasToolCalls && fullText) {
        messages.push({ role: 'assistant', content: fullText });
      }

      // Continue to next round
    }

    // Exceeded max tool rounds
    await this.conversationService.appendMessage(conversationId, {
      role: 'assistant',
      content: 'I apologize, but I was unable to complete the requested operation within the allowed number of steps.',
    });
    // CR-2：流式超轮次也记审计（isError），避免漏计数
    // HS-9 粒度门控：conversation 级仅 all 时记录
    if (await this._shouldAudit('conversation')) {
      this.auditService.log({
        userId,
        conversationId,
        action: 'chat',
        provider: providerName,
        model,
        isError: true,
        errorMessage: 'Exceeded max tool rounds',
      });
    }
    void this.memoryService
      .extractFromTurn(userId, request.message, conversationId)
      .catch(() => {});
    // CR-29：流式超限的道歉文案此前只入库不 yield，客户端只见 done；补 text 事件
    yield {
      type: 'text',
      content:
        'I apologize, but I was unable to complete the requested operation within the allowed number of steps.',
    };
    yield { type: 'done', conversationId };
  }

  /**
   * 生成写操作的人工可读摘要（用于确认卡片）。
   */
  private summarizeWriteTool(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    const title = (args.title as string) ?? '';
    switch (toolName) {
      case 'create_event':
        return `创建事件：${title}（${args.startTime ?? '?'} 至 ${args.endTime ?? '?'}）`;
      case 'create_todo':
        return `创建待办：${title}${args.dueDate ? `（截止 ${args.dueDate}）` : ''}`;
      default:
        return `执行操作：${toolName}`;
    }
  }

  /**
   * 生成只读工具的简短执行摘要（用于 tool_start 卡片）。
   */
  private summarizeReadTool(toolName: string): string {
    switch (toolName) {
      case 'query_events':
        return '查询事件';
      case 'count_events_by_status':
        return '统计事件';
      case 'query_events_by_keyword':
        return '搜索事件';
      case 'get_user_stats':
        return '获取用户统计';
      case 'navigate_page':
        return '页面跳转';
      default:
        return `执行操作：${toolName}`;
    }
  }

  /**
   * 生成工具执行结果摘要（用于 tool_end 卡片）。
   */
  private summarizeToolResult(toolName: string, result: ToolResult): string {
    if (!result.success) return result.error ?? '执行失败';
    const d = result.data as any;
    switch (toolName) {
      case 'query_events':
      case 'query_events_by_keyword':
        return `查询到 ${Array.isArray(d) ? d.length : 0} 个结果`;
      case 'count_events_by_status':
        return typeof d?.total === 'number' ? `共 ${d.total} 个事件` : '统计完成';
      case 'get_user_stats':
        return '获取用户统计完成';
      case 'navigate_page':
        return `跳转至${d?.description ?? ''}`;
      case 'create_event':
        return '创建事件成功';
      case 'create_todo':
        return '创建待办成功';
      default:
        return '执行完成';
    }
  }

  /** HS-5 工具结果字符上限（防大查询结果撑爆上下文窗口） */
  private static readonly TOOL_RESULT_MAX_CHARS = 4000;
  private static readonly TOOL_RESULT_MAX_ARRAY = 20;

  /**
   * HS-5 截断工具结果：超限时保留结构（数组截断到前 N 条 + 标记），
   * 让 LLM 拿到足够信息回答，又不会撑爆上下文。
   */
  private truncateToolResult(result: ToolResult): string {
    let json = JSON.stringify(result);
    if (json.length <= AiService.TOOL_RESULT_MAX_CHARS) return json;

    // 数组结果：截断到前 N 条
    const data = result.data as any;
    if (Array.isArray(data)) {
      const truncated = data.slice(0, AiService.TOOL_RESULT_MAX_ARRAY);
      const slim = {
        ...result,
        data: truncated,
        _truncated: `结果已截断，共 ${data.length} 条，仅展示前 ${AiService.TOOL_RESULT_MAX_ARRAY} 条`,
      };
      json = JSON.stringify(slim);
    } else if (data && typeof data === 'object') {
      // 对象结果：精简到成功标志 + 截断标记，避免回填巨量详情
      const slim = {
        success: result.success,
        error: result.error,
        data: { _truncated: '结果过大已精简，详情请查审计日志', _originalKeys: Object.keys(data) },
      };
      json = JSON.stringify(slim);
    }

    // 保底：字符串硬截断 + 提示
    if (json.length > AiService.TOOL_RESULT_MAX_CHARS) {
      json = `${json.slice(0, AiService.TOOL_RESULT_MAX_CHARS)}... [截断]`;
    }
    return json;
  }

  /**
   * 获取带 Fallback 的 Provider
   */
  private resolveProvider(request: ChatRequest): {
    conversation: null;
    providerName: string;
    provider: LlmProvider;
  } {
    const providerName = request.provider ?? this.config.defaultProvider;
    const chain = FALLBACK_CHAIN[providerName] ?? [providerName];
    const errors: string[] = [];

    for (const name of chain) {
      try {
        const provider = this.providerFactory.getProvider(name);
        return { conversation: null, providerName: name, provider };
      } catch {
        errors.push(`${name}: not found`);
        continue;
      }
    }

    // Can't happen since getProvider throws but let's be safe
    throw new Error(
      `No provider available: ${errors.join('; ')}`,
    );
  }

  /**
   * 工具调用循环（非流式）
   */
  private async runToolLoop(params: {
    provider: LlmProvider;
    providerName: string;
    conversationId: string;
    userId: string;
    model: string;
    initialToolDefs: any[];
    fallbackProviders: string[];
    images?: string[];
  }): Promise<{ finalContent: string; usage?: { promptTokens: number; completionTokens: number }; navigateTo?: string; toolCalls?: string[] }> {
    let messages = await this.buildMessages(params.conversationId, params.images);
    let currentProvider = params.provider;
    let currentProviderName = params.providerName;
    let usage: { promptTokens: number; completionTokens: number } | undefined;
    let navigateTo: string | undefined;
    const toolCalls: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const tools = params.initialToolDefs;

      let result: GenerateResult;
      try {
        result = await currentProvider.generate({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          model: params.model,
        });
      } catch (err) {
        console.error(
          `[AiService] Provider "${currentProviderName}" failed:`,
          (err as Error).message,
        );
        // Try fallback
        const fallbackResult = await this.tryFallback(
          params.fallbackProviders,
          params.model,
          { messages, tools: tools.length > 0 ? tools : undefined },
        );
        if (!fallbackResult) {
          throw new Error(
            `All providers failed after ${round + 1} attempts. Last error: ${(err as Error).message}`,
          );
        }
        result = fallbackResult.result;
        // CR-28：后续轮次用「实际成功」的 provider，而非回退链首（可能也是失败的）
        currentProvider = this.providerFactory.getProvider(fallbackResult.providerName);
        currentProviderName = fallbackResult.providerName;
      }

      if (result.usage) {
        usage = result.usage;
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        // No more tool calls — done
        messages.push({ role: 'assistant', content: result.content });
        return { finalContent: result.content, usage, navigateTo, toolCalls };
      }

      // Execute tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.content || '',
      };
      if (result.toolCalls.length > 0) {
        assistantMsg.tool_calls = result.toolCalls;
      }
      messages.push(assistantMsg);

      for (const tc of result.toolCalls) {
        toolCalls.push(tc.name);
        try {
          const args = JSON.parse(tc.arguments);
          // HS-2 工具权限门控（featureFlag / requireVerifiedEmail）
          await this._assertToolAllowed(tc.name, params.userId);
          // 非流式路径无确认通道：写操作不自动执行，返回提示让 LLM 引导用户走流式
          const resolvedResult = (await this._requiresConfirmation(tc.name))
            ? {
                success: false,
                error:
                  'Write operations require confirmation; please use streaming chat.',
              }
            : await this._executeReadTool(tc.name, args, params.userId);

          // 检测导航请求 — 工具返回 navigateTo 时记录
          if (resolvedResult.success && resolvedResult.data && (resolvedResult.data as any).navigateTo) {
            navigateTo = (resolvedResult.data as any).navigateTo;
          }

          // 审计日志：工具调用（HS-9 粒度门控：tool 级在 off 时不记录）
          if (await this._shouldAudit('tool')) {
            this.auditService.log({
              userId: params.userId,
              conversationId: params.conversationId,
              action: 'tool_call',
              detail: `${tc.name}(${tc.arguments})`,
              isError: !resolvedResult.success,
              errorMessage: resolvedResult.error,
            });
          }

          messages.push({
            role: 'tool',
            content: this.truncateToolResult(resolvedResult),
            tool_call_id: tc.id,
          });
        } catch {
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              success: false,
              error: `Failed to execute tool "${tc.name}"`,
            }),
            tool_call_id: tc.id,
          });
        }
      }

      // Continue loop for next round
    }

    throw new Error(
      `Exceeded maximum tool call rounds (${MAX_TOOL_ROUNDS})`,
    );
  }

  /**
   * Fallback：按顺序尝试备用 Provider
   */
  private async tryFallback(
    fallbackChain: string[],
    model: string,
    params: { messages: ChatMessage[]; tools?: any[] },
  ): Promise<{ result: GenerateResult; providerName: string } | null> {
    for (const name of fallbackChain) {
      try {
        const provider = this.providerFactory.getProvider(name);
        const result = await provider.generate({
          messages: params.messages,
          tools: params.tools,
          model,
        });
        return { result, providerName: name };
      } catch (fallbackErr) {
        console.error(
          `[AiService] Fallback provider "${name}" also failed:`,
          (fallbackErr as Error).message,
        );
        continue;
      }
    }
    return null;
  }

  /**
   * 流式 Fallback（CR-28）：主 provider 在产出任何内容之前失败（stream() 抛错 /
   * 首个 chunk 即 error）时，切换下一个 provider 重开流；已产出内容后的错误
   * 无法干净回退，直接透传。全部失败时 yield 一个最终 error chunk。
   */
  private async *streamWithProviderFallback(params: {
    chain: string[];
    messages: ChatMessage[];
    tools?: any[];
    model: string;
  }): AsyncIterable<StreamChunk> {
    let lastError = 'Unknown provider error';
    for (const name of params.chain) {
      let provider: LlmProvider;
      try {
        provider = this.providerFactory.getProvider(name);
      } catch {
        lastError = `Provider "${name}" is not configured`;
        continue;
      }
      let hasContent = false;
      try {
        const stream = provider.stream({
          messages: params.messages,
          tools: params.tools,
          model: params.model,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'error') {
            lastError = chunk.error ?? 'Unknown stream error';
            if (hasContent) {
              // 已产出内容 → 无法回退，透传错误并停止
              yield chunk;
              return;
            }
            // 首个 chunk 即错误（未产出任何内容）→ 尝试下一个 provider
            break;
          }
          hasContent = true;
          yield chunk;
        }
        // 正常完整结束 → 成功；首块错误 break（hasContent=false）→ 继续外层循环
        if (hasContent) return;
      } catch (err) {
        lastError = (err as Error).message;
        if (hasContent) throw err;
        console.error(
          `[AiService] Streaming provider "${name}" failed:`,
          lastError,
        );
      }
    }
    yield {
      type: 'error',
      error: `All providers failed. Last error: ${lastError}`,
    };
  }

  /**
   * 构建发送给 LLM 的消息列表
   * @param images 当前请求待附加的图片 URL（AI-12 多模态，仅本次请求，不落库）
   */
  private async buildMessages(
    conversationId: string,
    images?: string[],
  ): Promise<ChatMessage[]> {
    const conv = await this.conversationService.peekConversation(conversationId);
    // 上下文压缩：超阈值时把旧轮次折叠进摘要，回放「摘要 + 最近窗口」
    const effectiveConv = this.compactor
      ? await this.compactor.ensureCompacted(conv)
      : conv;

    // AI-17 提示词管理：Settings 里 ai_system_prompt 覆盖默认（热生效，管理台可编辑）
    const systemPrompt = this.settingsService
      ? String(await this.settingsService.getWithDefault('ai_system_prompt', this.config.systemPrompt))
      : this.config.systemPrompt;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 注入用户长期记忆（第二条 system 消息，作为参考上下文）
    // HS-8：记忆内容注入前掩码敏感字段 + 系统边界标注 + 丢弃疑似注入条
    const memories = await this.memoryService.getForUser(effectiveConv.userId, 8);
    const sanitizedMemories = memories
      .map((m) => {
        const clean = sanitizeMemoryEntry(m.content);
        return clean ? { ...m, content: clean } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (sanitizedMemories.length > 0) {
      messages.push({
        role: 'system',
        content:
          markSystemBoundary('memory', sanitizedMemories.map((m) => `- ${m.content}`).join('\n')),
      });
      // fire-and-forget：记录使用时间以提升相关度排序
      void this.memoryService
        .markUsed(
          effectiveConv.userId,
          sanitizedMemories.map((m) => m.content),
        )
        .catch(() => {});
    }

    // 对话前文摘要（第三条 system 消息）
    // HS-8：摘要也走掩码 + 边界标注
    if (effectiveConv.summary) {
      messages.push({
        role: 'system',
        content: markSystemBoundary(
          'summary',
          sanitizeExternalContent(effectiveConv.summary),
        ),
      });
    }

    for (const msg of effectiveConv.messages) {
      const chatMsg: ChatMessage = {
        role: msg.role as ChatMessage['role'],
        content: msg.content,
      };
      if (msg.toolCallId) {
        chatMsg.tool_call_id = msg.toolCallId;
      }
      messages.push(chatMsg);
    }

    // AI-12 多模态：把本次请求待附加的图片挂到最后一条 user 消息（不落库）
    if (images && images.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          messages[i].images = images;
          break;
        }
      }
    }

    return messages;
  }

  /**
   * 导航意图检测
   *
   * 直接关键词匹配识别导航请求，在调用 LLM 之前拦截。
   * 保证导航功能 100% 响应，不依赖 LLM 工具调用。
   */
  private detectNavigation(
    message: string,
  ): { route: string; reply: string } | null {
    const trimmed = message.trim();
    if (!trimmed) return null;

    // 写操作动词：命中则视为操作请求（交给 LLM 走工具/确认流程），不做页面跳转。
    // 避免「帮我创建事件」「去安排日程」这类含页面关键词但意图是写操作的请求被劫持。
    const actionVerbs = ['创建', '新增', '添加', '删除', '取消', '编辑', '修改', '安排'];
    const isActionRequest = actionVerbs.some((v) => trimmed.includes(v));
    if (isActionRequest) return null;

    // 导航触发词：只要消息包含这些词之一就认为有导航意图。
    // 「帮我」是辅助动词而非导航动词，去掉以避免「帮我创建事件」被误判。
    const navVerbs = ['打开', '去', '跳转到', '转到', '前往', '进入', '到'];
    const hasNavIntent = navVerbs.some((v) => trimmed.includes(v));
    if (!hasNavIntent) return null;

    // 页面映射表：按优先顺序匹配
    const pageMap: Array<{ keywords: string[]; route: string; label: string }> = [
      { keywords: ['首页', '主页', 'home', 'dashboard'], route: '/', label: '首页' },
      { keywords: ['事件', '日程', '日历', 'events'], route: '/events', label: '事件列表' },
      { keywords: ['发现', 'explore'], route: '/explore', label: '发现页' },
      { keywords: ['个人资料', '资料', 'profile'], route: '/profile', label: '个人资料' },
      { keywords: ['设置', '系统设置', 'settings'], route: '/settings', label: '设置' },
      { keywords: ['上传', 'upload', '文件上传'], route: '/upload', label: '文件上传' },
      { keywords: ['ai', 'AI', '助手'], route: '/ai', label: 'AI 助手' },
    ];

    for (const page of pageMap) {
      if (page.keywords.some((k) => trimmed.includes(k))) {
        return {
          route: page.route,
          reply: `已为您跳转到${page.label}。`,
        };
      }
    }

    return null;
  }
}
