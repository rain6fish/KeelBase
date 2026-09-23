// SPDX-License-Identifier: Apache-2.0

/**
 * AI 对话编排服务
 *
 * 核心编排层：整合 Provider 调用、工具执行、对话管理。
 * 处理多轮工具调用循环、Fallback 机制、对话保存。
 */

import { R4ApprovalService } from './approvals/r4-approval.service';
import { ProviderRoutingService } from './providers/provider-routing.service';
import { StreamAccumulator } from './providers/stream-accumulator';
import { ToolRegistry } from './tools/tool-registry';
import { ToolGateService } from './tools/tool-gate.service';
import { ToolExecutionService } from './tools/tool-execution.service';
import { ToolPresentationService } from './tools/tool-presentation.service';
import { ToolExposureService } from './tools/tool-exposure.service';
import { AuthorizationExplainerService, buildAllowSnapshot } from './authorization-explainer.service';
import { ConversationService } from './conversation/conversation.service';
import { AuditService } from './audit/audit.service';
import { captureDecisionEvidence } from './audit/decision-evidence';
import { buildToolCallAudit } from './audit/tool-call-audit';
import { AiDailyUsageService } from './audit/ai-daily-usage.service';
import { RouterAgent, Intent } from './agents/router-agent.service';
import { LlmUsage, addLlmUsage } from './llm-usage';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { ReflectionAgent } from './agents/reflection-agent.service';
import { tracer, withSpan } from '../common/tracing/tracer';
import { SpanStatusCode } from '@opentelemetry/api';
import { PlanExecuteAgent } from './agents/plan-execute-agent.service';
import { RagAgent } from './agents/rag-agent.service';
import { MemoriesService } from './memory/memory.service';
import { ConfirmationStore } from './confirmation/confirmation.store';
import { ConversationCompactor } from './conversation/conversation-compactor';
import { SubAgentOrchestrator } from './agents/sub-agent-orchestrator.service';
import {
  ToolResult,
  RISK_STRATEGY,
  AuthorizationDeniedError,
} from './interfaces/tool.interface';
import { GovernancePolicyService } from './governance/governance-policy.service';
import {
  markSystemBoundary,
  sanitizeExternalContent,
  sanitizeMemoryEntry,
} from './security/injection-guard';
import { checkContentSafety } from './security/content-safety';
import { ContentSafetyService } from './security/content-safety.service';
import { deriveAiBusinessEvent } from './audit/ai-business-event';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';
import { NotFoundException, Optional } from '@nestjs/common';
import { BusinessException } from '../common/errors/business.exception';
import {
  LlmProvider,
  GenerateResult,
  StreamChunk,
  ChatMessage,
} from './interfaces/llm-provider.interface';

const MAX_TOOL_ROUNDS = 5;

export interface ChatRequest {
  message: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  /** AI-12 多模态：用户消息附带的图片 URL 列表 */
  images?: string[];
  /** System AI Assistant：覆盖默认 system prompt（管理员专用提示词，内部字段不暴露 HTTP DTO） */
  systemPrompt?: string;
  /** System AI Assistant：跳过关键词导航短路，导航交给 LLM + navigate_admin_page 工具 */
  adminMode?: boolean;
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

  constructor(
    // Provider 路由与回退（第六刀）：选路 / 回退链 / 流式回退
    private readonly llmRouter: ProviderRoutingService,
    private readonly toolRegistry: ToolRegistry,
    private readonly conversationService: ConversationService,
    private readonly config: AiServiceConfig,
    private readonly auditService: AuditService,
    // 每日配额已从 AuditService 拆出（不属审计职责）；此处只做用量预留/释放
    private readonly usageQuota: AiDailyUsageService,
    // 工具门控（阶段 3「主战场」第一刀）：能不能跑 / 要不要确认 / 走不走 R4 / 什么风险级
    private readonly toolGate: ToolGateService,
    // 工具执行（第二刀）：读/写工具的真正执行与副作用登记；门控在它内部被复用
    private readonly toolExecution: ToolExecutionService,
    // R4 双人审批（第三刀）：审批请求生命周期；裁决后的执行仍走上面的写管道
    private readonly r4Approval: R4ApprovalService,
    // 呈现/摘要（第四刀）：确认卡文案 / 影响预览 / 撤销档 / 结果截断
    private readonly presentation: ToolPresentationService,
    // 工具对外面（第五刀）：清单 / 指纹 / MCP 出口 / 集成诊断
    private readonly toolExposure: ToolExposureService,
    private readonly ragAgent: RagAgent,
    private readonly abilityFactory: CaslAbilityFactory,
    private readonly memoryService: MemoriesService,
    private readonly confirmationStore: ConfirmationStore,
    private readonly compactor: ConversationCompactor,
    private readonly subAgentOrchestrator: SubAgentOrchestrator,
    private readonly authorizationExplainer: AuthorizationExplainerService,
    private readonly settingsService?: SettingsService,
    private readonly governancePolicy?: GovernancePolicyService,
    // N-6 AI-23 深度化：统一内容安全（读 Settings 配置 + 命中审计）；缺省降级静态 checkContentSafety
    @Optional() private readonly contentSafety?: ContentSafetyService,
  ) {}

  /**
   * RG-2.1 AI 每日限额：Settings 里 ai_daily_limit（>0 时启用）原子预留当日槽位
   * （AuditService.reserveDailyUsage 条件递增），并发请求不再集体越限。
   * 返回 true=已预留（对话进行中即计入，成功后保留、失败由调用方 release）；
   * false=未注入 SettingsService / 未启用限额（单测/降级场景）。
   */
  private async enforceDailyLimit(userId: string): Promise<boolean> {
    const settings = this.settingsService;
    if (!settings) return false;
    const limit = await settings.getAiDailyLimit();
    if (limit <= 0) return false; // 0 = 不限

    const reserved = await this.usageQuota.reserveDailyUsage(userId, limit);
    if (!reserved) throw BusinessException.of('AI_DAILY_LIMIT');
    return true;
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
   * HS-9 审计粒度：all = 记对话+工具；write = 只记工具调用；off = 不记。
   */
  private async _shouldAudit(scope: 'conversation' | 'tool'): Promise<boolean> {
    if (!this.governancePolicy) return true;
    const granularity = await this.governancePolicy.getAuditGranularity();
    if (granularity === 'off') return false;
    if (granularity === 'write') return scope === 'tool';
    return true;
  }

  // ── 呈现/摘要（确认卡文案 / 影响预览 / 撤销档 / 结果截断）已拆至 ToolPresentationService（阶段 3 第八刀）──

  // ── 工具对外面（清单 / 指纹 / MCP 出口 / 集成诊断）已拆至 ToolExposureService（阶段 3 第九刀）──

  /**
   * 非流式对话：发送消息，处理工具调用，返回完整回复
   */
  async chat(
    userId: string,
    request: ChatRequest,
  ): Promise<ChatResponse> {
    const reserved = await this.enforceDailyLimit(userId);
    try {
      return await withSpan('ai.chat', async () => {
        return this.chatImpl(userId, request);
      }, {
        'ai.user_id': userId,
        'ai.provider': request.provider,
        'ai.model': request.model,
      });
    } catch (err) {
      if (reserved) await this.usageQuota.releaseDailyUsage(userId).catch(() => {});
      throw err;
    }
  }

  /** N-6 统一内容安全：读 Settings 动态配置 + 命中审计 + 抛 AI_CONTENT_BLOCKED（缺省降级静态 check） */
  private async _checkContentSafety(message: string, userId: string): Promise<void> {
    const safety = this.contentSafety
      ? await this.contentSafety.check(message, { userId })
      : checkContentSafety(message);
    if (safety.blocked) {
      throw BusinessException.of('AI_CONTENT_BLOCKED', `内容安全检查未通过（${safety.reason}）`);
    }
  }

  /**
   * 即时确认窗口（秒）—— **单源**。run 聚合与逐条确认两处原本各读一次 Settings，
   * 任一处口径变了窗口就会不一致；取不到（未注入 Settings）时退回 60s（与拆分前逐字一致）。
   *
   * The confirmation window in seconds, read in one place. The run aggregation and the per-tool
   * confirmation path each used to read the setting for themselves.
   */
  private async _confirmationTtlSeconds(): Promise<number> {
    if (!this.settingsService) return 60;
    return Number(await this.settingsService.getWithDefault(SETTING_KEYS.CONFIRMATION_TTL, 60));
  }

  /**
   * 解析本轮会话：给定 id 但会话已不存在（如服务重启清空内存）时自动新建；其余错误（越权等）**照抛不吞**。
   * 无 id 时直接新建。
   *
   * Resolve the turn's conversation — the given id when it still exists, otherwise a fresh one.
   * Only a missing conversation triggers the create; any other failure (e.g. forbidden) is rethrown.
   */
  private async _resolveConversation(
    userId: string,
    request: ChatRequest,
    providerName: string,
  ): Promise<string> {
    const create = () =>
      this.conversationService.createConversation(
        userId,
        providerName,
        request.model ?? this.config.defaultModel,
      );
    if (!request.conversationId) return (await create()).id;
    try {
      await this.conversationService.getConversation(
        request.conversationId,
        userId,
        this._abilityFor(userId),
      );
      return request.conversationId;
    } catch (e) {
      // CR-27：仅「会话不存在」时自动新建；越权（Forbidden）等错误放行，不吞
      if (!(e instanceof NotFoundException)) throw e;
      return (await create()).id;
    }
  }

  /**
   * 聚合本轮可并入 run 的「即时确认写工具」（docs/run-level-approval.spec.md §2）。
   *
   * 返回 `null` = 不构成 run（可聚合成员不足 2 条），调用方走逐条确认路径。
   * **任何解析 / 注册异常都只是让该工具退出聚合**（留给逐条路径如实报错）—— 绝不因预扫描中断整条 SSE 流。
   * R5、R4（异步审批）、已信任、无摘要、门控未过的成员一律不并入，各自走原路径。
   *
   * Collect the write tool calls that may be aggregated into a single run-level approval; `null` when
   * fewer than two qualify. Every parse/registry failure just drops that tool from the aggregation.
   */
  private async _collectRunCandidates(
    userId: string,
    toolCalls: Array<{ index: number; name: string; args: string }>,
    trustedTools: Set<string>,
  ): Promise<{
    aggregable: Array<{ idx: number; name: string; parsed: Record<string, unknown>; summary: string; risk: string }>;
    runRisk: string;
    ttlSeconds: number;
  } | null> {
    const ttlSeconds = await this._confirmationTtlSeconds();
    const cands: Array<{
      idx: number;
      name: string;
      parsed: Record<string, unknown>;
      summary: string | null;
      risk: string;
    }> = [];
    for (const tc of toolCalls) {
      if (trustedTools.has(tc.name)) continue; // HS-6 免确认
      // 未注册工具（LLM 幻觉名 / 外部 mcp_* 工具，ExternalToolProvider 不入 ToolRegistry）会让
      // _requiresConfirmation/_requiresApproval 经 ToolRegistry.getTool 抛 `Tool "x" not found`；
      // 须与循环内逐条路径同样容错——否则异常逸出 chatStream 会中断整条 SSE 流（而非降级为该工具失败）
      try {
        if (!(await this.toolGate.requiresConfirmation(tc.name))) continue; // 读工具
        if (await this.toolGate.requiresApproval(tc.name)) continue; // R4 异步审批不混入
      } catch {
        continue; // 注册/解析异常的工具留给逐条路径如实报错，不中断流
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(tc.args);
      } catch {
        continue; // 解析失败留循环原样报错
      }
      let risk = 'R3';
      try {
        risk = this.toolRegistry?.riskLevel(tc.name) ?? 'R3';
      } catch {
        /* registry 未含该工具 → 默认 R3 */
      }
      if (risk === 'R5') continue; // R5 留循环内逐条 block
      // 评审 H2 修复：HS-2 门控在聚合前预检——禁用/角色白名单/未验证/策略禁用的成员不并入 run，
      // 避免「run 先获授权、成员执行时才拒」的无效授权序（与逐条断言同 gate）
      try {
        await this.toolGate.assertToolAllowed(tc.name, userId);
      } catch {
        continue; // 留逐条路径由断言如实报错，不并入 run
      }
      cands.push({
        idx: tc.index,
        name: tc.name,
        parsed,
        summary: this.presentation.writeToolSummary(tc.name, parsed),
        risk,
      });
    }
    // 无具体摘要（writeToolSummary null）的动作降级单条即时确认，不并入 run（spec §3.3 诚实边界）
    const aggregable = cands.filter((c): c is typeof c & { summary: string } => c.summary !== null);
    if (aggregable.length < 2) return null;
    // runRisk = 批内最高风险级（R3 run 成员通常恒 R3，max 保持通用）
    // 键序取自权威表（R0→R5 升序声明）——本地硬编码副本会在新增/改名风险级时静默漂移，使 runRisk 取错
    const RISK_ORDER = Object.keys(RISK_STRATEGY);
    const runRisk = aggregable.reduce(
      (max, c) => (RISK_ORDER.indexOf(c.risk) > RISK_ORDER.indexOf(max) ? c.risk : max),
      'R0',
    );
    return { aggregable, runRisk, ttlSeconds };
  }

  /** chat 实际实现（被 chat 的业务 span 包装；拆分便于单独加 span 而不影响外部调用方） */
  private async chatImpl(
    userId: string,
    request: ChatRequest,
  ): Promise<ChatResponse> {
    // N-6 AI-23 内容安全：敏感词/越狱/注入 → 拒绝（读 Settings 动态配置 + 命中审计）
    await this._checkContentSafety(request.message, userId);
    const { providerName, provider } = this.llmRouter.resolve(request.provider);

    const conversationId = await this._resolveConversation(userId, request, providerName);

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
    const hasNav = !request.adminMode && this.detectNavigation(request.message) !== null;
    // 分类命中关键词时不走 LLM（无用量）；走 LLM 时那次调用同样消耗 token，记下来并入整轮口径。
    // 同一累加器也承载「上下文压缩」那笔前置开销（见各分支的 buildMessages 调用）。
    let preflightUsage: LlmUsage | undefined;
    let intent: Intent;
    if (matchedSkill && !hasNav) {
      intent = 'delegate';
    } else {
      const routed = await this.routerAgent.classify(
        request.message,
        provider,
        request.model ?? this.config.defaultModel,
      );
      intent = routed.intent;
      preflightUsage = routed.usage;
    }

    let finalContent: string;
    let usage: LlmUsage | undefined;
    let navigateTo: string | undefined;
    let toolCalls: string[] | undefined;

    // 各分支只知道自己的那一段开销；分类与压缩这些前置开销在此统一并入后再记账
    const turnTotal = (): LlmUsage | undefined => addLlmUsage(usage, preflightUsage);

    if (intent === 'navigate') {
      // 导航请求 — 关键词匹配，不走 LLM
      const navResult = request.adminMode ? null : this.detectNavigation(request.message);
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
      const built = await this.buildMessages(conversationId, request.images, request.systemPrompt);
      preflightUsage = addLlmUsage(preflightUsage, built.usage);
      const messages = built.messages;
      const ragResult = await this.ragAgent.answer(
        messages,
        request.message,
        provider,
        request.model ?? this.config.defaultModel,
        { userId, conversationId },
      );

      await this.conversationService.appendMessage(conversationId, {
        role: 'assistant',
        content: ragResult.content,
      });

      // 知识库问答同样消耗 LLM token：不记则与被修的流式同类，成本统计静默漏计
      usage = ragResult.usage;
      const knowledgeTotal = turnTotal();

      // 审计日志（HS-9 粒度门控：conversation 级仅 all 时记录）
      if (await this._shouldAudit('conversation')) {
        this.auditService.log({
          userId,
          conversationId,
          action: 'knowledge',
          provider: providerName,
          model: request.model ?? this.config.defaultModel,
          promptTokens: knowledgeTotal?.promptTokens,
          completionTokens: knowledgeTotal?.completionTokens,
        });
      }
      return {
        conversationId,
        reply: ragResult.content,
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
        usage: knowledgeTotal,
      };
    }

    if (intent === 'delegate') {
      // 子代理委托：分解为子代理任务顺序执行，聚合后总结 + 反思
      const built = await this.buildMessages(conversationId, request.images, request.systemPrompt);
      preflightUsage = addLlmUsage(preflightUsage, built.usage);
      const messages = built.messages;
      const delegateResult = await this.subAgentOrchestrator.run({
        messages,
        userRequest: request.message,
        provider,
        toolRegistry: this.toolRegistry,
        userId,
        model: request.model ?? this.config.defaultModel,
        // NC-3 只读门控：子代理经同一治理层执行（R5/策略/角色/adminOnly + 写工具拒绝）
        readOnlyExecutor: (tool, args, uid) => this.toolExecution.executeAgentRead(tool, args, uid),
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
        const reflection = await this.reflectionAgent.reflect(
          [
            ...messages.slice(0, 1),
            { role: 'user', content: request.message },
          ],
          finalContent,
          provider,
          request.model ?? this.config.defaultModel,
        );
        finalContent = reflection.content;

        // 整轮 = 任务分解 + 各子代理多轮循环 + 汇总 + 反思（此前只记了汇总那一次）
        usage = addLlmUsage(delegateResult.usage, summary.usage);
        usage = addLlmUsage(usage, reflection.usage);
      } else {
        // 委托失败（分解/全部任务无效）→ 回退标准工具循环
        const fallbackResult = await this.runToolLoop({
          provider,
          providerName,
          conversationId,
          userId,
          model: request.model ?? this.config.defaultModel,
          initialToolDefs: await this.toolExposure.buildToolDefs(),
          fallbackProviders: this.llmRouter.fallbackChain(providerName),
          systemPrompt: request.systemPrompt,
          images: request.images,
        });
        finalContent = fallbackResult.finalContent;
        usage = fallbackResult.usage;
        navigateTo = fallbackResult.navigateTo;
        toolCalls = fallbackResult.toolCalls;
      }
    } else if (intent === 'analyze' || intent === 'plan') {
      // Plan-and-Execute：多步推理
      const built = await this.buildMessages(conversationId, request.images, request.systemPrompt);
      preflightUsage = addLlmUsage(preflightUsage, built.usage);
      const messages = built.messages;
      const planResult = await this.planExecuteAgent.planAndExecute(
        messages,
        provider,
        this.toolRegistry,
        userId,
        request.model ?? this.config.defaultModel,
        // NC-3 只读门控：plan 步骤经同一治理层执行，防 LLM 计划的写/禁用工具被直调
        (tool, args, uid) => this.toolExecution.executeAgentRead(tool, args, uid),
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
        const reflection = await this.reflectionAgent.reflect(
          [
            ...messages.slice(0, 1),
            { role: 'user', content: request.message },
          ],
          finalContent,
          provider,
          request.model ?? this.config.defaultModel,
        );
        finalContent = reflection.content;

        // 整轮 = 规划 + 汇总 + 反思（此前只记了汇总那一次）
        usage = addLlmUsage(planResult.usage, summary.usage);
        usage = addLlmUsage(usage, reflection.usage);
      } else {
        // Plan failed, fallback to normal tool loop
        const fallbackResult = await this.runToolLoop({
          provider,
          providerName,
          conversationId,
          userId,
          model: request.model ?? this.config.defaultModel,
          initialToolDefs: await this.toolExposure.buildToolDefs(),
          fallbackProviders: this.llmRouter.fallbackChain(providerName),
          systemPrompt: request.systemPrompt,
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
        initialToolDefs: await this.toolExposure.buildToolDefs(),
        fallbackProviders: this.llmRouter.fallbackChain(providerName),
        systemPrompt: request.systemPrompt,
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

    const total = turnTotal();

    // 审计日志（HS-9 粒度门控：conversation 级仅 all 时记录）
    if (await this._shouldAudit('conversation')) {
      this.auditService.log({
        userId,
        conversationId,
        action: intent === 'delegate' ? 'delegate' : intent === 'plan' ? 'plan' : intent === 'analyze' ? 'analyze' : 'chat',
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
        promptTokens: total?.promptTokens,
        completionTokens: total?.completionTokens,
      });
    }
    return {
      conversationId,
      reply: finalContent,
      provider: providerName,
      model: request.model ?? this.config.defaultModel,
      usage: total,
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
    let reserved = false;
    try {
      reserved = await this.enforceDailyLimit(userId);
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
      // 对话失败释放预留槽（成功保留 = 计入当日用量）
      if (reserved) await this.usageQuota.releaseDailyUsage(userId).catch(() => {});
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
    // N-6 AI-23 内容安全：敏感词/越狱/注入 → 拒绝（读 Settings 动态配置 + 命中审计）
    await this._checkContentSafety(request.message, userId);
    // HS-6：本次会话内被用户信任的写工具（确认时勾选「本会话免确认」后加入）
    const trustedTools = new Set<string>();
    const { providerName } = this.llmRouter.resolve(request.provider);
    // CR-28：流式 Fallback 链（首个 chunk 前失败自动切下一个 provider）
    const streamFallbackChain = this.llmRouter.fallbackChain(providerName);

    const conversationId = await this._resolveConversation(userId, request, providerName);

    // Append user message
    await this.conversationService.appendMessage(conversationId, {
      role: 'user',
      content: request.message,
    });

    // 导航意图预检测
    const navResult = request.adminMode ? null : this.detectNavigation(request.message);
    if (navResult) {
      await this.conversationService.appendMessage(conversationId, {
        role: 'assistant',
        content: navResult.reply,
      });
      // 导航事件先于文本下发：流式客户端据此渲染「跳转」入口（与非流式 chat 的 navigateTo 对齐）
      yield { type: 'navigate', route: navResult.route };
      yield { type: 'text', content: navResult.reply };
      yield { type: 'done', conversationId };
      return;
    }

    const builtMessages = await this.buildMessages(conversationId, request.images, request.systemPrompt);
    let messages = builtMessages.messages;
    const model = request.model ?? this.config.defaultModel;

    // 整轮对话的 token 用量：上下文压缩 + 工具轮次每次 LLM 调用各带一份 usage，累加才是这轮的真实开销
    // （审计的 chat 行每轮对话只写一次，故必须在此聚合，不能只取最后一轮）
    let turnUsage: LlmUsage | undefined = builtMessages.usage;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const tools = await this.toolExposure.buildToolDefs();
      const stream = this.llmRouter.streamWithProviderFallback({
        chain: streamFallbackChain,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        model,
      });

      // 本轮 chunk 归并（阶段 3 第十一刀提出）：文本逐块转发、工具调用按 index 拼装、用量累加
      const acc = new StreamAccumulator();
      for await (const chunk of stream) {
        const forward = acc.apply(chunk);
        if (forward) yield forward;
      }
      // 本轮用量并入整轮（一轮对话可能有多次 LLM 调用）
      turnUsage = addLlmUsage(turnUsage, acc.usage);

      if (acc.streamError) {
        // 流式失败（yield error 不抛 → 外层 chatStream catch 不触发）：显式释放 daily-limit 预留槽，
        // 防零 token 失败对话计入当日用量、耗尽限额后误拦（对齐非流式 chat 失败释放语义）
        await this.usageQuota.releaseDailyUsage(userId).catch(() => {});
        await this.conversationService.appendMessage(conversationId, {
          role: 'assistant',
          content: `Error: ${acc.streamError}`,
        });
        yield { type: 'done', conversationId };
        return;
      }

      if (!acc.hasToolCalls && acc.toolCalls().length === 0) {
        // Pure text response — done
        await this.conversationService.appendMessage(conversationId, {
          role: 'assistant',
          content: acc.fullText,
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
            promptTokens: turnUsage?.promptTokens,
            completionTokens: turnUsage?.completionTokens,
          });
        }
        // fire-and-forget：规则式抽取用户记忆，不阻塞对话
        void this.memoryService
          .extractFromTurn(userId, request.message, conversationId)
          .catch(() => {});
        yield { type: 'done', conversationId };
        return;
      }

      // 先 push 带 tool_calls 的 assistant 消息（API 要求：tool 消息必须跟在带 tool_calls 的 assistant 消息之后）
      const toolCallsArray = acc.toolCalls().map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.args,
        index: tc.index,
        }));

      if (toolCallsArray.length > 0) {
        messages.push({
          role: 'assistant',
          content: acc.fullText || '',
          tool_calls: toolCallsArray,
          ...(acc.reasoningText ? { reasoning_content: acc.reasoningText } : {}),
        });
      }

      // KB-5 run-level approval：预扫描本轮需即时确认写工具，≥2 且均有具体摘要 → 聚成一个 run 一次授权
      // （docs/run-level-approval.spec.md §2：R5/R4/trusted/无摘要均不并入，各自走原路径；run 决策先于逐条 decision）
      let runState: { idxSet: Set<number>; outcome: 'approve' | 'decline' | 'timeout'; runId: string } | undefined;
      {
        // 聚合交给 `_collectRunCandidates`（分析段）；这里只留「创建 run → 下发确认 → 等决策」的编排。
        // The aggregation is now `_collectRunCandidates`; this block keeps only the orchestration.
        const collected = await this._collectRunCandidates(userId, acc.toolCalls(), trustedTools);
        if (collected) {
          const { aggregable, runRisk, ttlSeconds } = collected;
          const { token, decision } = await this.confirmationStore.createRun(
            userId,
            aggregable.map((c) => ({
              toolName: c.name,
              args: c.parsed,
              summary: c.summary,
              riskLevel: c.risk,
            })),
            runRisk,
            ttlSeconds * 1000,
            conversationId,
          );
          const runImpact = this.presentation.writeImpact(aggregable.map((c) => c.name));
          yield {
            type: 'confirmation_request',
            confirmation: {
              token,
              mode: 'run',
              ...(runImpact ? { impact: runImpact } : {}),
              run: {
                runId: token,
                riskLevel: runRisk,
                items: aggregable.map((c) => {
                  const revokeClass = this.presentation.revokeClass(c.name);
                  return {
                    toolName: c.name,
                    summary: c.summary!,
                    riskLevel: c.risk,
                    // §22.17 ④ v1.1：档位解析不到（外部 / 未注册名）则省略，不补默认
                    ...(revokeClass ? { revokeClass } : {}),
                  };
                }),
              },
            },
          };
          const { outcome } = await decision;
          const approved = outcome === 'approve';
          // 保留完整 outcome（含 'timeout'）——成员逐条回放时不得把 run 超时塌缩成用户 decline（spec §2.4 沿用超时语义）
          runState = { idxSet: new Set(aggregable.map((c) => c.idx)), outcome, runId: token };
          // run 级整体决策关卡先于逐条 decision（spec §2.3）
          yield {
            type: 'confirmation_decision',
            confirmationDecision: { mode: 'run', runId: token, decision: outcome, approved },
          };
          if (await this._shouldAudit('tool')) {
            this.auditService.log({
              userId,
              conversationId,
              action: 'tool_confirmation',
              detail: `run(${token}) ${aggregable.length} items → ${outcome}`,
              isError: !approved,
              errorMessage: outcome === 'timeout' ? 'User did not respond in time' : outcome === 'decline' ? 'User declined the operation' : undefined,
            });
          }
        }
      }

      // Execute accumulated tool calls
      for (const tc of acc.toolCalls()) {
        let started = false;
        let pendingApproval = false; // R4 高影响动作（已提交审批）——通用 tool_call 审计不算失败
        try {
          const parsed = JSON.parse(tc.args);
          // HS-2 工具权限门控（featureFlag / requireVerifiedEmail）— 先于确认流程
          await this.toolGate.assertToolAllowed(tc.name, userId);
          const isWrite = await this.toolGate.requiresConfirmation(tc.name);
          started = true;
          // 工具过程可视化：执行前发 tool_start，前端渲染"执行中"卡片
          // ADT（P0-14）：isWrite 让前端标注读/写，写操作需确认、可撤销
          // W5-⑦ Explainable Authz：携带 riskLevel + authorization（为何允许/为何需确认）
          const authz = await this.authorizationExplainer.getAuthorizationReasons(
            tc.name,
            userId,
            isWrite,
            await this.toolGate.riskLevelFor(tc.name),
          );
          yield {
            type: 'tool_start',
            toolStart: {
              name: tc.name,
              summary: isWrite
                ? this.presentation.summarizeWriteTool(tc.name, parsed)
                : this.presentation.summarizeReadTool(tc.name),
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
              result = await this.toolExecution.executeWrite(tc.name, parsed, userId, conversationId);
            } else if (await this.toolGate.requiresApproval(tc.name)) {
              // R4 双人审批：高影响动作需第二人（approver）审批——创建持久化审批请求，不阻塞 operator 对话
              // §internal.15(4)：审批档由策略档位（mode=approval）或声明风险级 R4 决定——管理员可在策略中心把 R3 工具升档为审批
              const approval = await this.r4Approval.createR4ApprovalRequest(userId, tc.name, parsed, conversationId);
              const approvalImpact = this.presentation.writeImpact([tc.name]);
              const approvalRevokeClass = this.presentation.revokeClass(tc.name);
              yield {
                type: 'confirmation_request',
                confirmation: {
                  token: approval.token,
                  toolName: tc.name,
                  summary: this.presentation.summarizeWriteTool(tc.name, parsed),
                  arguments: parsed,
                  mode: 'approval',
                  ...(approvalImpact ? { impact: approvalImpact } : {}),
                  ...(approvalRevokeClass ? { revokeClass: approvalRevokeClass } : {}),
                  authorization: await this.authorizationExplainer.getAuthorizationReasons(
                    tc.name,
                    userId,
                    true,
                    await this.toolGate.riskLevelFor(tc.name),
                  ),
                },
              };
              result = { success: false, error: '已提交人工审批，等待审批人决策（R4 高影响动作）' };
              pendingApproval = true;
              if (await this._shouldAudit('tool')) {
                this.auditService.log({
                  userId,
                  conversationId,
                  action: 'tool_confirmation',
                  detail: `${tc.name}(${JSON.stringify(parsed)}) → pending_approval`,
                });
              }
            } else {
              // 写操作：先发 confirmation_request，等待用户确认后才执行
              // KB-5：本工具若是已聚合成 run 的成员（idx ∈ runState.idxSet）→ run 已一次授权/拒绝，
              // 不再重复发单条 confirmation_request、不再 await——直接用 run 结果进入下方 approve/decline 公共逻辑
              // （spec §2.5：approve 整批逐条执行、decline 整批跳过；run 级 decision 关卡已由预扫描先行发出）
              let outcome: 'approve' | 'decline' | 'timeout';
              let trustTool: boolean | undefined;
              if (runState?.idxSet.has(tc.index)) {
                outcome = runState.outcome; // approve / decline / timeout（超时如实回放，不塌缩）
              } else {
                const ttlSeconds = await this._confirmationTtlSeconds();
                const { token, decision } = await this.confirmationStore.create(
                  userId,
                  tc.name,
                  parsed,
                  ttlSeconds * 1000,
                  conversationId,
                );
                const singleImpact = this.presentation.writeImpact([tc.name]);
                const singleRevokeClass = this.presentation.revokeClass(tc.name);
                yield {
                  type: 'confirmation_request',
                  confirmation: {
                    token,
                    toolName: tc.name,
                    summary: this.presentation.summarizeWriteTool(tc.name, parsed),
                    arguments: parsed,
                    // §22.17 ④ 影响预览：确认前告知将动到几个动作、哪类对象
                    ...(singleImpact ? { impact: singleImpact } : {}),
                    // §22.17 ④ 影响预览 v1.1：撤销口径——批准前告知这批动作事后能不能撤回
                    ...(singleRevokeClass ? { revokeClass: singleRevokeClass } : {}),
                    // W5-⑦ Explainable Authz：让用户理解「为何此操作需确认」（风险级/策略/检查清单）
                    authorization: await this.authorizationExplainer.getAuthorizationReasons(
                      tc.name,
                      userId,
                      true,
                      await this.toolGate.riskLevelFor(tc.name),
                    ),
                  },
                };
                ({ outcome, trustTool } = await decision);
              }
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
              // §4 G1：run 成员执行的副作用挂 runId（供 run 级批量撤销精确圈定）
              const execRunId = runState?.idxSet.has(tc.index) ? runState.runId : undefined;
              result = await this.toolExecution.executeWrite(tc.name, parsed, userId, conversationId, execRunId);
              yield {
                type: 'confirmation_decision',
                confirmationDecision: {
                  toolName: tc.name,
                  decision: 'approve',
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
                  summary: this.presentation.summarizeToolResult(tc.name, result),
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
                confirmationDecision: { toolName: tc.name, decision: outcome, approved: false },
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
            result = await this.toolExecution.executeRead(tc.name, parsed, userId);
            yield {
              type: 'tool_end',
              toolEnd: {
                name: tc.name,
                success: result.success,
                summary: this.presentation.summarizeToolResult(tc.name, result),
                error: result.error,
              },
            };
          }
          messages.push({
            role: 'tool',
            content: this.presentation.truncateToolResult(result),
            tool_call_id: tc.id,
          });
          // CR-2：流式工具执行审计（对齐非流式 runToolLoop）——行形状见 buildToolCallAudit
          // HS-9 粒度门控：tool 级在 off 时不记录
          if (await this._shouldAudit('tool')) {
            this.auditService.log(
              buildToolCallAudit({
                userId,
                conversationId,
                provider: providerName,
                toolName: tc.name,
                argsJson: tc.args,
                bridge: this.toolExecution.isProxyTool(tc.name),
                result,
                // R4 待批不算失败（与下一分支的 errorMessage 同源）
                pendingApproval,
                // §internal.16 A-5 事件时点放行授权依据快照：仅当工具实际放行并成功执行才写（对象格式 parseChecks 只认数组 → 不误判为拒绝）。
                // 用户拒绝/超时、R4 待批、运行时失败等「未放行/未成功」行不落快照——否则 isError+authorization 非空
                // 会被 A-8 denied 视图与 blocked 聚合误判为越权/阻断（放行快照语义 = 成功分支，见 docs/audit-authz-snapshot.spec.md）
                // §internal.17③ Policy Evidence：快照携带授权时点策略内容指纹（policy.revision），供「决策可复现」校验
                authorization: result.success ? buildAllowSnapshot(tc.name, authz) : undefined,
              }),
            );
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
          // CR-2：流式工具执行失败审计（T5 跨入口一致：deny 与两路成功分支同标 bridge）
          // HS-9 粒度门控：tool 级在 off 时不记录；W5-⑦ Explainable Authz：拒绝时记录真实原因
          if (await this._shouldAudit('tool')) {
            this.auditService.log(
              buildToolCallAudit({
                userId,
                conversationId,
                provider: providerName,
                toolName: tc.name,
                argsJson: tc.args,
                bridge: this.toolExecution.isProxyTool(tc.name),
                errorMessage: deniedMsg,
                authorization: err instanceof AuthorizationDeniedError ? JSON.stringify(err.reasons) : undefined,
              }),
            );
          }
        }
      }

      // If we have text but no tool calls, add it as an assistant message
      if (!acc.hasToolCalls && acc.fullText) {
        messages.push({ role: 'assistant', content: acc.fullText });
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
        promptTokens: turnUsage?.promptTokens,
        completionTokens: turnUsage?.completionTokens,
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
   * 获取带 Fallback 的 Provider
   */
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
    systemPrompt?: string;
  }): Promise<{ finalContent: string; usage?: { promptTokens: number; completionTokens: number }; navigateTo?: string; toolCalls?: string[] }> {
    const builtMessages = await this.buildMessages(params.conversationId, params.images, params.systemPrompt);
    let messages = builtMessages.messages;
    let currentProvider = params.provider;
    let currentProviderName = params.providerName;
    // 压缩那笔前置开销随之起算；工具各轮在此之上累加
    let usage: LlmUsage | undefined = builtMessages.usage;
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
          `[AiService] Provider "${currentProviderName}" failed:`, // codeql[js/tainted-format-string] 固定前缀模板，消息作参数不被解释为格式串
          (err as Error).message,
        );
        // Try fallback
        const fallbackResult = await this.llmRouter.tryFallback(
          params.fallbackProviders,
          params.model,
          { messages, tools: tools.length > 0 ? tools : undefined },
        );
        if (!fallbackResult) {
          // NC-2：全 provider 失败 → 可执行码（CR-5 细节只进日志）
          console.warn(`[AiService] All providers failed after ${round + 1} attempts: ${(err as Error).message}`);
          throw BusinessException.of('LLM_UNAVAILABLE');
        }
        result = fallbackResult.result;
        // CR-28：后续轮次用「实际成功」的 provider，而非回退链首（可能也是失败的）
        currentProvider = this.llmRouter.provider(fallbackResult.providerName);
        currentProviderName = fallbackResult.providerName;
      }

      // 整轮对话口径：多轮工具调用时每轮都是一次真实 LLM 调用，只留最后一轮会漏掉前面的开销
      usage = addLlmUsage(usage, result.usage);

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
          await this.toolGate.assertToolAllowed(tc.name, params.userId);
          // 非流式路径无确认通道：写操作不自动执行，返回提示让 LLM 引导用户走流式
          const resolvedResult = (await this.toolGate.requiresConfirmation(tc.name))
            ? {
                success: false,
                error:
                  'Write operations require confirmation; please use streaming chat.',
              }
            : await this.toolExecution.executeRead(tc.name, args, params.userId);

          // 检测导航请求 — 工具返回 navigateTo 时记录
          if (resolvedResult.success && resolvedResult.data && (resolvedResult.data as any).navigateTo) {
            navigateTo = (resolvedResult.data as any).navigateTo;
          }

          // 审计日志：工具调用（HS-9 粒度门控：tool 级在 off 时不记录）
          if (await this._shouldAudit('tool')) {
            // §internal.16 A-5 事件时点放行授权依据快照：对齐流式路径（对象格式 parseChecks 不误判为拒绝）。
            // 非流式路径写工具一律被拒（返回「请用流式」），读工具失败亦不落快照——快照仅当实际放行并成功执行才写，
            // 避免 isError+authorization 非空被 A-8 denied 视图与 blocked 聚合误判为越权/阻断
            const authz = resolvedResult.success
              ? await this.authorizationExplainer.getAuthorizationReasons(
                  tc.name,
                  params.userId,
                  await this.toolGate.requiresConfirmation(tc.name),
                  await this.toolGate.riskLevelFor(tc.name),
                )
              : null;
            this.auditService.log(
              buildToolCallAudit({
                userId: params.userId,
                conversationId: params.conversationId,
                provider: currentProviderName,
                toolName: tc.name,
                argsJson: tc.arguments,
                bridge: this.toolExecution.isProxyTool(tc.name),
                result: resolvedResult,
                authorization: authz ? buildAllowSnapshot(tc.name, authz) : undefined,
              }),
            );
          }

          messages.push({
            role: 'tool',
            content: this.presentation.truncateToolResult(resolvedResult),
            tool_call_id: tc.id,
          });
        } catch (err) {
          // W5-⑦：非流式路径也透传结构化拒绝原因（此前只流式透传），让模型看到「为何阻止」
          const denied = err instanceof AuthorizationDeniedError;
          const deniedMsg = denied ? err.message : `Failed to execute tool "${tc.name}"`;
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              success: false,
              error: deniedMsg,
              ...(denied ? { reasons: err.reasons } : {}),
            }),
            tool_call_id: tc.id,
          });
          // W5-⑦ Explainable Authz 落库：拒绝路径补审计 + reasons（决策轨迹展示「为何阻止」）
          // T5 跨入口一致：B 路径 proxy 工具 deny 也标 bridge（与流式 deny、两路成功分支同形）
          if (await this._shouldAudit('tool')) {
            this.auditService.log(
              buildToolCallAudit({
                userId: params.userId,
                conversationId: params.conversationId,
                provider: currentProviderName,
                toolName: tc.name,
                argsJson: tc.arguments,
                bridge: this.toolExecution.isProxyTool(tc.name),
                errorMessage: deniedMsg,
                authorization: denied ? JSON.stringify(err.reasons) : undefined,
              }),
            );
          }
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
  /**
   * 构建发送给 LLM 的消息列表
   * @param images 当前请求待附加的图片 URL（AI-12 多模态，仅本次请求，不落库）
   * @param overrideSystemPrompt System AI Assistant 专用：覆盖默认 system prompt（缺省走 Settings/默认）
   */
  private async buildMessages(
    conversationId: string,
    images?: string[],
    overrideSystemPrompt?: string,
  ): Promise<{ messages: ChatMessage[]; usage?: LlmUsage }> {
    const conv = await this.conversationService.peekConversation(conversationId);
    // 上下文压缩：超阈值时把旧轮次折叠进摘要，回放「摘要 + 最近窗口」
    // 压缩本身要花一次 LLM 调用 → 用量随消息一起交回，由调用方并入本轮口径
    const compaction = this.compactor
      ? await this.compactor.ensureCompacted(conv)
      : { conversation: conv };
    const effectiveConv = compaction.conversation;

    // AI-17 提示词管理：Settings 里 ai_system_prompt 覆盖默认（热生效，管理台可编辑）
    // 管理员系统助手用固定 ADMIN_SYSTEM_PROMPT（绕过 ai_system_prompt，by design）
    const systemPrompt =
      overrideSystemPrompt ??
      (this.settingsService
        ? String(await this.settingsService.getWithDefault('ai_system_prompt', this.config.systemPrompt))
        : this.config.systemPrompt);

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

    return { messages, usage: compaction.usage };
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
