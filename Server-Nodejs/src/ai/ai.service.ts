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
import { ToolResult } from './interfaces/tool.interface';
import { SettingsService } from '../settings/settings.service';
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
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
  /** AI 请求跳转的页面路由（前端收到后执行导航） */
  navigateTo?: string;
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
      } catch {
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
      const messages = await this.buildMessages(conversationId);
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

      // 审计日志
      this.auditService.log({
        userId,
        conversationId,
        action: 'knowledge',
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
      });

      return {
        conversationId,
        reply: ragResult.content,
        provider: providerName,
        model: request.model ?? this.config.defaultModel,
      };
    }

    if (intent === 'delegate') {
      // 子代理委托：分解为子代理任务顺序执行，聚合后总结 + 反思
      const messages = await this.buildMessages(conversationId);
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
          initialToolDefs: this.toolRegistry.getToolDefinitions(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
        });
        finalContent = fallbackResult.finalContent;
        usage = fallbackResult.usage;
        navigateTo = fallbackResult.navigateTo;
      }
    } else if (intent === 'analyze' || intent === 'plan') {
      // Plan-and-Execute：多步推理
      const messages = await this.buildMessages(conversationId);
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
          initialToolDefs: this.toolRegistry.getToolDefinitions(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
        });
        finalContent = fallbackResult.finalContent;
        usage = fallbackResult.usage;
        navigateTo = fallbackResult.navigateTo;
      }
    } else {
      // 默认：标准 Tool Loop
      const toolResult = await this.runToolLoop({
        provider,
        providerName,
        conversationId,
        userId,
        model: request.model ?? this.config.defaultModel,
        initialToolDefs: this.toolRegistry.getToolDefinitions(),
        fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
      });
      finalContent = toolResult.finalContent;
      usage = toolResult.usage;
      navigateTo = toolResult.navigateTo;
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

    // 审计日志
    this.auditService.log({
      userId,
      conversationId,
      action: intent === 'delegate' ? 'delegate' : intent === 'plan' ? 'plan' : intent === 'analyze' ? 'analyze' : 'chat',
      provider: providerName,
      model: request.model ?? this.config.defaultModel,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
    });

    return {
      conversationId,
      reply: finalContent,
      provider: providerName,
      model: request.model ?? this.config.defaultModel,
      usage,
      navigateTo,
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
    const { conversation, providerName, provider } =
      this.resolveProvider(request);

    let conversationId: string;
    if (request.conversationId) {
      // 如果会话不存在（如服务器重启导致内存清空），自动创建新会话
      try {
        await this.conversationService.getConversation(request.conversationId, userId, this._abilityFor(userId));
        conversationId = request.conversationId;
      } catch {
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

    let messages = await this.buildMessages(conversationId);
    const model = request.model ?? this.config.defaultModel;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const tools = this.toolRegistry.getToolDefinitions();
      const stream = provider.stream({
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
          const isWrite = this.toolRegistry.requiresConfirmation(tc.name);
          started = true;
          // 工具过程可视化：执行前发 tool_start，前端渲染"执行中"卡片
          yield {
            type: 'tool_start',
            toolStart: {
              name: tc.name,
              summary: isWrite
                ? this.summarizeWriteTool(tc.name, parsed)
                : this.summarizeReadTool(tc.name),
              arguments: parsed,
            },
          };

          let result: ToolResult;
          if (isWrite) {
            // 写操作：先发 confirmation_request，等待用户确认后才执行
            const { token, decision } = this.confirmationStore.create(
              userId,
              tc.name,
              parsed,
            );
            yield {
              type: 'confirmation_request',
              confirmation: {
                token,
                toolName: tc.name,
                summary: this.summarizeWriteTool(tc.name, parsed),
                arguments: parsed,
              },
            };
            const outcome: ConfirmationOutcome = await decision;
            if (outcome === 'approve') {
              result = await this.toolRegistry.execute(tc.name, parsed, userId);
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
          } else {
            result = await this.toolRegistry.execute(tc.name, parsed, userId);
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
            content: JSON.stringify(result),
            tool_call_id: tc.id,
          });
        } catch {
          // 已发出 tool_start 则补发失败的 tool_end，避免前端悬空"执行中"卡片
          if (started) {
            yield {
              type: 'tool_end',
              toolEnd: {
                name: tc.name,
                success: false,
                summary: '工具执行失败',
                error: 'Tool execution failed',
              },
            };
          }
          // If the tool call couldn't be fully reconstructed or executed,
          // add an error result
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Tool execution failed' }),
            tool_call_id: tc.id,
          });
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
    void this.memoryService
      .extractFromTurn(userId, request.message, conversationId)
      .catch(() => {});
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
  }): Promise<{ finalContent: string; usage?: { promptTokens: number; completionTokens: number }; navigateTo?: string }> {
    let messages = await this.buildMessages(params.conversationId);
    let currentProvider = params.provider;
    let currentProviderName = params.providerName;
    let usage: { promptTokens: number; completionTokens: number } | undefined;
    let navigateTo: string | undefined;

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
        result = fallbackResult;
        currentProvider = this.providerFactory.getProvider(
          params.fallbackProviders[0],
        );
      }

      if (result.usage) {
        usage = result.usage;
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        // No more tool calls — done
        messages.push({ role: 'assistant', content: result.content });
        return { finalContent: result.content, usage, navigateTo };
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
        try {
          const args = JSON.parse(tc.arguments);
          // 非流式路径无确认通道：写操作不自动执行，返回提示让 LLM 引导用户走流式
          const resolvedResult = this.toolRegistry.requiresConfirmation(tc.name)
            ? {
                success: false,
                error:
                  'Write operations require confirmation; please use streaming chat.',
              }
            : await this.toolRegistry.execute(tc.name, args, params.userId);

          // 检测导航请求 — 工具返回 navigateTo 时记录
          if (resolvedResult.success && resolvedResult.data && (resolvedResult.data as any).navigateTo) {
            navigateTo = (resolvedResult.data as any).navigateTo;
          }

          // 审计日志：工具调用
          this.auditService.log({
            userId: params.userId,
            conversationId: params.conversationId,
            action: 'tool_call',
            detail: `${tc.name}(${tc.arguments})`,
            isError: !resolvedResult.success,
            errorMessage: resolvedResult.error,
          });

          messages.push({
            role: 'tool',
            content: JSON.stringify(resolvedResult),
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
  ): Promise<GenerateResult | null> {
    for (const name of fallbackChain) {
      try {
        const provider = this.providerFactory.getProvider(name);
        return await provider.generate({
          messages: params.messages,
          tools: params.tools,
          model,
        });
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
   * 构建发送给 LLM 的消息列表
   */
  private async buildMessages(conversationId: string): Promise<ChatMessage[]> {
    const conv = await this.conversationService.peekConversation(conversationId);
    // 上下文压缩：超阈值时把旧轮次折叠进摘要，回放「摘要 + 最近窗口」
    const effectiveConv = this.compactor
      ? await this.compactor.ensureCompacted(conv)
      : conv;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
    ];

    // 注入用户长期记忆（第二条 system 消息，作为参考上下文）
    const memories = await this.memoryService.getForUser(effectiveConv.userId, 8);
    if (memories.length > 0) {
      messages.push({
        role: 'system',
        content:
          '以下是关于用户的长期记忆（供参考；如与当前对话冲突，以当前对话为准）：\n' +
          memories.map((m) => `- ${m.content}`).join('\n'),
      });
      // fire-and-forget：记录使用时间以提升相关度排序
      void this.memoryService
        .markUsed(
          effectiveConv.userId,
          memories.map((m) => m.content),
        )
        .catch(() => {});
    }

    // 对话前文摘要（第三条 system 消息）
    if (effectiveConv.summary) {
      messages.push({
        role: 'system',
        content:
          '以下是本对话前文摘要（供参考；如与当前对话冲突，以当前对话为准）：\n' +
          effectiveConv.summary,
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

    console.log(`[AiService] detectNavigation triggered for: "${trimmed}"`);

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
        console.log(`[AiService] Navigation matched: "${page.label}" → ${page.route}`);
        return {
          route: page.route,
          reply: `已为您跳转到${page.label}。`,
        };
      }
    }

    return null;
  }
}
