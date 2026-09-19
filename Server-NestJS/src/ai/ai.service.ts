// SPDX-License-Identifier: Apache-2.0

/**
 * AI 对话编排服务
 *
 * 核心编排层：整合 Provider 调用、工具执行、对话管理。
 * 处理多轮工具调用循环、Fallback 机制、对话保存。
 */

import { Repository, In, IsNull } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiConfirmationRequest } from './approvals/ai-confirmation-request.entity';
import { LlmProviderFactory } from './providers/provider-factory';
import { ToolRegistry } from './tools/tool-registry';
import { ToolGateService } from './tools/tool-gate.service';
import { ToolExecutionService } from './tools/tool-execution.service';
import { ExternalToolRegistry } from './tools/external-tool-registry';
import { AuthorizationExplainerService, buildAllowSnapshot } from './authorization-explainer.service';
import { ConversationService } from './conversation/conversation.service';
import { AuditService } from './audit/audit.service';
import { captureDecisionEvidence } from './audit/decision-evidence';
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
import { ConfirmationStore, RunItem } from './confirmation/confirmation.store';
import { ConversationCompactor } from './conversation/conversation-compactor';
import { SubAgentOrchestrator } from './agents/sub-agent-orchestrator.service';
import {
  ToolDefinition,
  ToolResult,
  RISK_STRATEGY,
  AuthorizationDeniedError,
  ConfirmationImpact,
  RevokeClass,
  resolveRevokeClass,
} from './interfaces/tool.interface';
import { deriveWriteImpact } from './tool-effects/write-impact';
import { GovernancePolicyService, effectiveGateMode } from './governance/governance-policy.service';
import { ExternalToolProvider, ExternalToolDef } from './external-tool-provider.interface';
import {
  markSystemBoundary,
  sanitizeExternalContent,
  sanitizeMemoryEntry,
} from './security/injection-guard';
import { checkContentSafety } from './security/content-safety';
import { ContentSafetyService } from './security/content-safety.service';
import { deriveAiBusinessEvent } from './audit/ai-business-event';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { NotFoundException, Optional } from '@nestjs/common';
import { BusinessException } from '../common/errors/business.exception';
import {
  LlmProvider,
  GenerateResult,
  StreamChunk,
  ChatMessage,
} from './interfaces/llm-provider.interface';

const MAX_TOOL_ROUNDS = 5;

// demo = 确定性演示 Provider（P0-0）：无任何云 Provider 时兜底，链尾最后尝试
const FALLBACK_CHAIN: Record<string, string[]> = {
  deepseek: ['deepseek', 'qwen', 'openai', 'demo'],
  qwen: ['qwen', 'deepseek', 'openai', 'demo'],
  openai: ['openai', 'qwen', 'deepseek', 'demo'],
  anthropic: ['anthropic', 'deepseek', 'qwen', 'openai', 'demo'],
  gemini: ['gemini', 'deepseek', 'qwen', 'openai', 'demo'],
};

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

  /**
   * HS-10：注入外部工具提供者（McpGatewayService 实现；启动时调用）。
   * 状态本身已移到共享的 `ExternalToolRegistry`（阶段 3：门控域也要用它），此处保留同一入口，
   * 使 mcp 侧的接缝不变。
   */
  registerExternalToolProvider(provider: ExternalToolProvider): void {
    this.externalTools.register(provider);
  }

  constructor(
    private readonly providerFactory: LlmProviderFactory,
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
    // 外部工具提供者的共享持有者（门控与执行/清单域共用）
    private readonly externalTools: ExternalToolRegistry,
    private readonly ragAgent: RagAgent,
    private readonly abilityFactory: CaslAbilityFactory,
    private readonly memoryService: MemoriesService,
    private readonly confirmationStore: ConfirmationStore,
    private readonly compactor: ConversationCompactor,
    private readonly subAgentOrchestrator: SubAgentOrchestrator,
    private readonly authorizationExplainer: AuthorizationExplainerService,
    private readonly settingsService?: SettingsService,
    private readonly usersService?: UsersService,
    private readonly governancePolicy?: GovernancePolicyService,
    private readonly approvalsRepo?: Repository<AiConfirmationRequest>,
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

  /** §internal.16 A-5 Explainable Authorization 已拆至 AuthorizationExplainerService（阶段 2 切环） */
  /**
   * HS-10：内置 + 外部工具定义合并（供 LLM 工具流）。外部工具发现失败静默降级为内置。
   */
  private async _buildToolDefs(): Promise<ToolDefinition[]> {
    const builtin = this.toolRegistry.getToolDefinitions();
    if (!this.externalTools.current) return builtin;
    try {
      const external: ExternalToolDef[] = await this.externalTools.current.listExternalTools();
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
   * §22.17 ④ 影响预览：待确认写动作 → 影响描述符（无可解析副作用对象时返回 null，
   * 调用方据此**省略** impact 字段而非发 0）。spec docs/impact-preview.spec.md。
   */
  private _writeImpact(toolNames: string[]): ConfirmationImpact | null {
    return deriveWriteImpact(
      toolNames.map((toolName) => ({ toolName, isProxyWrite: this.toolExecution.isProxyTool(toolName) })),
    );
  }

  /**
   * §22.17 ④ 影响预览 v1.1 撤销口径：工具 → KB-6 撤销档（`resolveRevokeClass` 单源，显式声明优先）。
   * 与事后撤销页 / 工具治理页同源——批准前看到的档位与事后能做的撤销必须一致，故不另建映射。
   * spec docs/impact-preview.spec.md §3。
   *
   * **解析不到就返回 undefined（调用方省略该字段）**，与 `_writeImpact` 解析不到对象类型时同一诚实口径。
   * 未注册名（外部 `mcp_*` / LLM 幻觉名）在本文件是**被容忍放行**的（`_assertToolAllowed` 明确不拦未注册名），
   * 而真实注册表对它**抛错**——同段 `_assertToolAllowed` / `isProxyTool` 因此都包了 try/catch，本处同办。
   * 可达性（2026-09-17 实测）：**当前到不了**——逐条路径在确认前先调 `_requiresApproval`，它对未注册名的
   * `riskLevel` 调用无守卫、先抛，该工具以「执行失败」收尾（实测 chunk 序列 `tool_end → text → done`）。
   * 故本容错当前是护栏：失败后果不对称（未捕获异常会打断整条 SSE 确认流，容错只是少显示一行），
   * 一旦 `_requiresApproval` 改为容错，此处即成必经之路。不解析 ≠ 不可撤销，故不补默认值。详见 spec §3。
   */
  private _revokeClass(toolName: string): RevokeClass | undefined {
    try {
      return resolveRevokeClass(this.toolRegistry.getTool(toolName));
    } catch {
      return undefined;
    }
  }

  // ── R4 双人审批（W5 Risk-based Tool Contract）：R4 高影响动作需第二人（approver）审批 ──

  /** 创建持久化审批请求（operator 触发，approver 稍后决策；不阻塞 operator 对话）。 */
  async createR4ApprovalRequest(
    operatorId: string,
    toolName: string,
    args: Record<string, unknown>,
    conversationId?: string,
  ): Promise<{ token: string; id: number }> {
    if (!this.approvalsRepo) throw new Error('Approvals repository not injected');
    const token = randomUUID();
    const saved = await this.approvalsRepo.save(
      this.approvalsRepo.create({
        token,
        toolName,
        args: JSON.stringify(args),
        operatorId,
        riskLevel: 'R4',
        status: 'pending',
        conversationId,
      }),
    );
    return { token, id: saved.id };
  }

  /** 待审批 R4 列表（管理端审批页）。 */
  async listPendingApprovals(limit = 50): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.approvalsRepo) return [];
    // D2-1e：R3 确认也落库（riskLevel=R3），R4 审批列表只列 R4 高影响请求，避免混入。
    // KB-5：另排除 kind='run' 的整批授权聚合行——R4 工具经策略降为同步确认并入 run 后，
    // 该行 riskLevel=runRisk 可能为 'R4'，但它不是单个审批请求（toolName='run'），混入即伪审批。
    // 单条行 kind 为 'single'，迁移前旧行为 NULL——两者都保留。
    const base = { status: 'pending' as const, riskLevel: 'R4' as const };
    const items = await this.approvalsRepo.find({
      where: [{ ...base, kind: 'single' }, { ...base, kind: IsNull() }],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return this.withUserNames(items);
  }

  /** 已审批历史（管理端审批页）。 */
  async listDecidedApprovals(limit = 50): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.approvalsRepo) return [];
    const base = { status: In(['approved', 'declined']), riskLevel: 'R4' };
    const items = await this.approvalsRepo.find({
      where: [{ ...base, kind: 'single' }, { ...base, kind: IsNull() }],
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return this.withUserNames(items);
  }

  /** 审批路径可见：为审批列表附提交人/审批人用户名（operator → approver），审批路上的人可读。 */
  private async withUserNames(items: AiConfirmationRequest[]): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.usersService) return items;
    const ids = [
      ...new Set(
        items.flatMap((i) => [Number(i.operatorId), i.approverId ? Number(i.approverId) : null].filter((x): x is number => x != null)),
      ),
    ];
    const nameById = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const u = await this.usersService!.findOne(id, true);
          if (u.username) nameById.set(String(id), u.username);
        } catch {
          // 用户可能已删除
        }
      }),
    );
    return items.map((i) => ({
      ...i,
      operatorName: nameById.get(String(i.operatorId)) || String(i.operatorId),
      approverName: i.approverId ? nameById.get(String(i.approverId)) || String(i.approverId) : undefined,
    }));
  }

  /** approver 决策：approve → 以 operator 维度执行工具；decline → 拒绝。 */
  async decideApproval(
    token: string,
    approverId: string,
    decision: 'approve' | 'decline',
  ): Promise<{ ok: boolean; message?: string; success?: boolean; resultId?: unknown }> {
    if (!this.approvalsRepo) return { ok: false, message: 'not supported' };
    const req = await this.approvalsRepo.findOne({ where: { token } });
    if (!req || req.status !== 'pending') {
      return { ok: false, message: req ? 'already decided' : 'not found' };
    }
    // KB-5：run 聚合行（kind='run'，toolName='run'）不是单个审批请求——生命周期由 ConfirmationStore 的
    // run token 决策驱动。此处放行会把 run 行状态越权翻成 approved/declined，绕过 run 语义（且在途 SSE 决策
    // 仍挂在内存 promise 上）。该端点服务身份可达，故在边界拒绝，不依赖「列表不显示 run 行」这层约定。
    if (req.kind === 'run') {
      return { ok: false, message: 'run confirmation cannot be decided via approval endpoint' };
    }
    if (decision === 'approve' && req.operatorId === approverId) {
      return { ok: false, message: 'cannot self-approve' };
    }
    req.status = decision === 'approve' ? 'approved' : 'declined';
    req.approverId = approverId;
    req.decidedAt = new Date();
    await this.approvalsRepo.save(req);

    if (decision === 'approve') {
      const result = await this.executeApprovedTool(req);
      return { ok: true, success: result.success, resultId: (result.data as any)?.id, message: result.error };
    }
    return { ok: true, success: false };
  }

  /**
   * 裁决通过后以 operator 维度执行工具：复用写工具执行（幂等 + 副作用登记）+ 审计。
   * `outcomeNote` 记录**谁在哪儿批的**（R4 审批人 / R3 离线裁决），进 `tool_call` 审计行便于追溯。
   */
  async executeApprovedTool(req: AiConfirmationRequest, outcomeNote?: string): Promise<ToolResult> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(req.args || '{}');
    } catch {
      args = {};
    }
    const note = outcomeNote ?? `R4 approved by approver ${req.approverId}`;
    let result: ToolResult;
    try {
      result = await this.toolExecution.executeWrite(req.toolName, args, req.operatorId, req.conversationId);
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    await this.auditService.log({
      userId: req.operatorId,
      conversationId: req.conversationId,
      action: 'tool_call',
      detail: `${req.toolName}(${JSON.stringify(args)})`,
      isError: !result.success,
      errorMessage: result.success ? note : `${note}; execution failed: ${result.error}`,
      // 工具内部自调 LLM 时的开销记在工具自己这行
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      // §internal.16 A-1 业务事件名
      businessEvent: deriveAiBusinessEvent(req.toolName) ?? undefined,
    });
    return result;
  }

  /**
   * GA 待我确认中心（docs/ai-action-center.spec.md §9）：把一条确认存储行还原成**人读**信息
   * （摘要 / 影响预览 / 撤销档 / 展示模式）。这些知识都长在本类里（writeToolSummary / _writeImpact /
   * _revokeClass 均为 private），故由本类对外提供单一真源，而不让调用方各拼一份；
   * 列表与离线裁决的编排本身在 MyConfirmationService，不在这里。
   */
  describeConfirmation(row: AiConfirmationRequest): {
    summary: string | null;
    impact: ConfirmationImpact | null;
    revokeClass: RevokeClass | null;
    mode: 'immediate' | 'approval' | 'run';
    run: { runId: string; riskLevel: string; items: RunItem[] } | null;
  } {
    let args: Record<string, unknown> = {};
    try {
      args = row.args ? (JSON.parse(row.args) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    const runItems = row.kind === 'run' ? this._parseRunItems(row.runItems) : null;
    const mode: 'immediate' | 'approval' | 'run' =
      row.kind === 'run' ? 'run' : row.riskLevel === 'R4' ? 'approval' : 'immediate';
    const toolNames = mode === 'run' ? (runItems ?? []).map((i) => i.toolName) : [row.toolName];
    return {
      summary:
        mode === 'run'
          ? `一次授权整批（${(runItems ?? []).length} 个动作）`
          : this.writeToolSummary(row.toolName, args),
      impact: toolNames.length ? this._writeImpact(toolNames) : null,
      revokeClass: this._revokeClass(row.toolName) ?? null,
      mode,
      run: runItems ? { runId: row.token, riskLevel: row.riskLevel, items: runItems } : null,
    };
  }

  /** run 行携带的批内动作快照（JSON）；解析失败按空处理（不因此藏掉整行）。 */
  private _parseRunItems(raw?: string | null): RunItem[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as RunItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * HS-10 MCP 出口：现有工具暴露为 MCP 工具（尊重治理策略 enabled 开关）。
   */
  async listMcpTools(): Promise<
    Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      /** A2 Secure MCP Gateway：工具风险分级（R0-R5）与确认策略声明，客户端可见治理契约 */
      riskLevel: string;
      riskStrategy: string;
      requiresConfirmation: boolean;
    }>
  > {
    const defs = this.toolRegistry.getToolDefinitions();
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      riskLevel: string;
      riskStrategy: string;
      requiresConfirmation: boolean;
    }> = [];
    for (const d of defs) {
      const name = d.function.name;
      if (this.governancePolicy && !(await this.governancePolicy.isToolEnabled(name))) {
        continue;
      }
      const riskLevel = this.toolRegistry.riskLevel(name);
      tools.push({
        name,
        description: d.function.description,
        inputSchema: d.function.parameters as Record<string, unknown>,
        riskLevel,
        riskStrategy: RISK_STRATEGY[riskLevel],
        requiresConfirmation: this.toolRegistry.requiresConfirmation(name),
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
    await this.toolGate.assertToolAllowed(toolName, userId);
    if (await this.toolGate.requiresConfirmation(toolName)) {
      return { executed: false, requiresConfirmation: true };
    }
    return {
      executed: true,
      requiresConfirmation: false,
      result: await this.toolRegistry.execute(toolName, args, userId),
    };
  }

  /**
   * Runtime provenance 工具指纹（§13.1 后置项①，公开命名 provenance）：
   * 只暴露「多少个工具 / 读写分类 / 风险级分布」的汇总指纹，不含参数/权限详情（admin 专属）。
   * 供 GET /app/provenance（公开）回答「这个 AI 系统有哪些能力」。
   */
  getToolFingerprint(): { total: number; read: number; write: number; byRisk: Record<string, number> } {
    const tools = this.toolRegistry.getAllTools();
    const byRisk: Record<string, number> = {};
    let write = 0;
    for (const t of tools) {
      const lv = this.toolRegistry.riskLevel(t.name);
      byRisk[lv] = (byRisk[lv] ?? 0) + 1;
      if (t.requiresConfirmation) write++;
    }
    return { total: tools.length, read: tools.length - write, write, byRisk };
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
      const riskLevel = this.toolRegistry.riskLevel(tool.name);
      // §internal.15(4)：生效门控档位（策略 mode > legacy 布尔 > 声明风险级）；R5 恒 'blocked'
      const mode = effectiveGateMode(override, riskLevel);
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
        })),
        enabled: override.enabled ?? true,
        requiresConfirmation: mode === 'confirm' || mode === 'approval',
        requiresApproval: mode === 'approval',
        gateMode: mode,
        allowedRoles: override.allowedRoles ?? [],
        permissions: tool.permissions ?? null,
        riskLevel,
        riskStrategy: RISK_STRATEGY[riskLevel],
        // KB-6：撤销能力档位（none / local_compensate / governed_external / transactional）——工具治理面可见分档
        revokeClass: resolveRevokeClass(tool),
      };
    });
  }

  /**
   * B-proxy 外部系统（Java 集成）接入诊断：读 Settings ai_proxy_tools 的 baseUrl，
   * 拉取 Java example 的 /keelbase/status 健康度面板，供管理台监控中心聚合显示。
   * 未配置 → { configured:false }；非 Java 源（OpenAPI 代理等无 status 端点）→ statusEnabled:false。
   * Secret 不外泄（面板本就只给布尔/状态）。baseUrl 限定 http(s)，防 SSRF。
   */
  async getProxyIntegrationStatus(): Promise<Record<string, unknown>> {
    const raw = this.settingsService
      ? await this.settingsService.getWithDefault(SETTING_KEYS.PROXY_TOOLS, null)
      : null;
    if (!raw) return { configured: false };
    let cfg: Record<string, unknown>;
    try {
      cfg = typeof raw === 'string' ? JSON.parse(raw) : (raw as object);
    } catch {
      return { configured: false };
    }
    const baseUrl = String(cfg?.baseUrl ?? '');
    const audience = String(cfg?.audience ?? '');
    const configuredTools = Array.isArray(cfg?.tools) ? (cfg.tools as unknown[]).length : 0;
    if (!/^https?:\/\//i.test(baseUrl)) {
      return { configured: true, error: 'baseUrl 非法（仅 http(s)）', reachable: false };
    }
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/keelbase/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return {
          configured: true, baseUrl, audience, configuredTools,
          reachable: true, statusEnabled: false, error: `HTTP ${res.status}`,
        };
      }
      const status = await res.json().catch(() => ({}));
      return {
        configured: true, baseUrl, audience, configuredTools,
        reachable: true, statusEnabled: true, fetchedAt: new Date().toISOString(),
        ...(status as object),
      };
    } catch (err) {
      return {
        configured: true, baseUrl, audience, configuredTools,
        reachable: false, error: (err as Error).message,
      };
    }
  }

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

  /** chat 实际实现（被 chat 的业务 span 包装；拆分便于单独加 span 而不影响外部调用方） */
  private async chatImpl(
    userId: string,
    request: ChatRequest,
  ): Promise<ChatResponse> {
    // N-6 AI-23 内容安全：敏感词/越狱/注入 → 拒绝（读 Settings 动态配置 + 命中审计）
    await this._checkContentSafety(request.message, userId);
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
          initialToolDefs: await this._buildToolDefs(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
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
          initialToolDefs: await this._buildToolDefs(),
          fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
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
        initialToolDefs: await this._buildToolDefs(),
        fallbackProviders: FALLBACK_CHAIN[providerName] ?? [providerName],
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
        } else if (chunk.type === 'done' && chunk.usage) {
          turnUsage = addLlmUsage(turnUsage, chunk.usage);
        }
        // 'done' — handled after the loop
      }

      if (streamError) {
        // 流式失败（yield error 不抛 → 外层 chatStream catch 不触发）：显式释放 daily-limit 预留槽，
        // 防零 token 失败对话计入当日用量、耗尽限额后误拦（对齐非流式 chat 失败释放语义）
        await this.usageQuota.releaseDailyUsage(userId).catch(() => {});
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

      // KB-5 run-level approval：预扫描本轮需即时确认写工具，≥2 且均有具体摘要 → 聚成一个 run 一次授权
      // （docs/run-level-approval.spec.md §2：R5/R4/trusted/无摘要均不并入，各自走原路径；run 决策先于逐条 decision）
      let runState: { idxSet: Set<number>; outcome: 'approve' | 'decline' | 'timeout'; runId: string } | undefined;
      {
        const ttlSeconds = this.settingsService
          ? Number(
              await this.settingsService.getWithDefault(
                SETTING_KEYS.CONFIRMATION_TTL,
                60,
              ),
            )
          : 60;
        const cands: Array<{
          idx: number;
          name: string;
          parsed: Record<string, unknown>;
          summary: string | null;
          risk: string;
        }> = [];
        for (const [idx, tc] of accumulatedToolCalls) {
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
          // 避免「run 先获授权、成员执行时才拒」的无效授权序（与逐条 1380 断言同 gate）
          try {
            await this.toolGate.assertToolAllowed(tc.name, userId);
          } catch {
            continue; // 留逐条路径由 1380 断言如实报错，不并入 run
          }
          cands.push({ idx, name: tc.name, parsed, summary: this.writeToolSummary(tc.name, parsed), risk });
        }
        // 无具体摘要（writeToolSummary null）的动作降级单条即时确认，不并入 run（spec §3.3 诚实边界）
        const aggregable = cands.filter((c) => c.summary !== null);
        if (aggregable.length >= 2) {
          // runRisk = 批内最高风险级（R3 run 成员通常恒 R3，max 保持通用）
          // 键序取自权威表（R0→R5 升序声明）——本地硬编码副本会在新增/改名风险级时静默漂移，使 runRisk 取错
          const RISK_ORDER = Object.keys(RISK_STRATEGY);
          const runRisk = aggregable.reduce(
            (max, c) =>
              RISK_ORDER.indexOf(c.risk) > RISK_ORDER.indexOf(max)
                ? c.risk
                : max,
            'R0',
          );
          const { token, decision } = await this.confirmationStore.createRun(
            userId,
            aggregable.map((c) => ({
              toolName: c.name,
              args: c.parsed,
              summary: c.summary!,
              riskLevel: c.risk,
            })),
            runRisk,
            ttlSeconds * 1000,
            conversationId,
          );
          const runImpact = this._writeImpact(aggregable.map((c) => c.name));
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
                  const revokeClass = this._revokeClass(c.name);
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
      for (const [idx, tc] of accumulatedToolCalls) {
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
              result = await this.toolExecution.executeWrite(tc.name, parsed, userId, conversationId);
            } else if (await this.toolGate.requiresApproval(tc.name)) {
              // R4 双人审批：高影响动作需第二人（approver）审批——创建持久化审批请求，不阻塞 operator 对话
              // §internal.15(4)：审批档由策略档位（mode=approval）或声明风险级 R4 决定——管理员可在策略中心把 R3 工具升档为审批
              const approval = await this.createR4ApprovalRequest(userId, tc.name, parsed, conversationId);
              const approvalImpact = this._writeImpact([tc.name]);
              const approvalRevokeClass = this._revokeClass(tc.name);
              yield {
                type: 'confirmation_request',
                confirmation: {
                  token: approval.token,
                  toolName: tc.name,
                  summary: this.summarizeWriteTool(tc.name, parsed),
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
              if (runState?.idxSet.has(idx)) {
                outcome = runState.outcome; // approve / decline / timeout（超时如实回放，不塌缩）
              } else {
                const ttlSeconds = this.settingsService
                  ? Number(
                      await this.settingsService.getWithDefault(
                        SETTING_KEYS.CONFIRMATION_TTL,
                        60,
                      ),
                    )
                  : 60;
                const { token, decision } = await this.confirmationStore.create(
                  userId,
                  tc.name,
                  parsed,
                  ttlSeconds * 1000,
                  conversationId,
                );
                const singleImpact = this._writeImpact([tc.name]);
                const singleRevokeClass = this._revokeClass(tc.name);
                yield {
                  type: 'confirmation_request',
                  confirmation: {
                    token,
                    toolName: tc.name,
                    summary: this.summarizeWriteTool(tc.name, parsed),
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
              const execRunId = runState?.idxSet.has(idx) ? runState.runId : undefined;
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
              // R4 pending（已提交审批）不算失败：否则单次审批被计 approved+blocked+errors 三重误报
              isError: !result.success && !pendingApproval,
              errorMessage: result.error,
              // 工具内部自调 LLM 时（如 summarize_customer_360）的开销记在工具自己这行
              promptTokens: result.usage?.promptTokens,
              completionTokens: result.usage?.completionTokens,
              // §internal.16 A-1 业务行为取证：业务事件名 + Decision Evidence（链外列）
              businessEvent: deriveAiBusinessEvent(tc.name) ?? undefined,
              evidence: captureDecisionEvidence(tc.name, result) ?? undefined,
              // §internal.16 A-5 跨系统身份链：B 路径（ProxyTool 写向外部系统）标记 source=bridge
              source: this.toolExecution.isProxyTool(tc.name) ? 'bridge' : undefined,
              // AU-6（§22.19）：tool_call 行补 provider（此前仅 chat 行有）
              provider: providerName,
              // §internal.16 A-5 事件时点放行授权依据快照：仅当工具实际放行并成功执行才写（对象格式 parseChecks 只认数组 → 不误判为拒绝）。
              // 用户拒绝/超时、R4 待批、运行时失败等「未放行/未成功」行不落快照——否则 isError+authorization 非空
              // 会被 A-8 denied 视图与 blocked 聚合误判为越权/阻断（放行快照语义 = 成功分支，见 docs/audit-authz-snapshot.spec.md）
              // §internal.17③ Policy Evidence：快照携带授权时点策略内容指纹（policy.revision），供「决策可复现」校验
              authorization: result.success
                ? buildAllowSnapshot(tc.name, authz)
                : undefined,
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
              // T5 跨入口一致：流式 deny 也标 source=bridge（对齐非流式 deny :1849 与两路成功分支）
              source: this.toolExecution.isProxyTool(tc.name) ? 'bridge' : undefined,
              provider: providerName,
              isError: true,
              errorMessage: deniedMsg,
              authorization: err instanceof AuthorizationDeniedError ? JSON.stringify(err.reasons) : undefined,
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
   * KB-5：写工具的"人读 diff 摘要"（run 卡"有 diff 而非盲批"前提，docs/run-level-approval.spec.md §3）。
   * 返回 null 表示该工具暂无具体摘要（诚实降级：单条确认卡仍显示通用文案，run 聚合不并入该条）。
   * 未来演进：每工具自带 summarize(args)（spec §3.2），此处 switch 随之退位。
   */
  private writeToolSummary(
    toolName: string,
    args: Record<string, unknown>,
  ): string | null {
    const title = (args.title as string) ?? '';
    switch (toolName) {
      case 'create_event':
        return `创建事件：${title}（${args.startTime ?? '?'} 至 ${args.endTime ?? '?'}）`;
      case 'create_todo':
        return `创建待办：${title}${args.dueDate ? `（截止 ${args.dueDate}）` : ''}`;
      case 'create_customers':
        return `创建客户：${(args.name as string) ?? ''}`;
      case 'create_followup_task':
        return `创建跟进任务：${title}`;
      case 'create_contract':
        return `创建合同：${title}`;
      case 'create_project':
        return `创建项目：${title}`;
      case 'create_project_task':
        return `创建项目任务：${title}`;
      case 'update_customer_status':
        return `更新客户状态：${(args.status as string) ?? ''}`;
      case 'submit_approval_request':
        return '提交审批请求';
      case 'create_knowledge':
        return '创建知识条目';
      default:
        return null;
    }
  }

  /**
   * 生成写操作的人工可读摘要（用于单条确认卡）。
   */
  private summarizeWriteTool(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    return this.writeToolSummary(toolName, args) ?? '执行写操作';
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
      case 'query_customers':
        return '查询客户';
      case 'query_customer_orders':
        return '查询客户订单';
      case 'query_customer_activities':
        return '查询客户跟进';
      case 'query_contacts':
        return '查询联系人';
      case 'query_opportunities':
        return '查询销售机会';
      case 'analyze_customer_risk':
        return '分析客户风险';
      case 'query_projects':
        return '查询项目';
      case 'query_project_tasks':
        return '查询项目任务';
      case 'analyze_project_risk':
        return '分析项目延期风险';
      case 'query_approval_requests':
        return '查询审批请求';
      case 'query_approval_policies':
        return '查询审批政策';
      case 'query_knowledge':
        return '查询知识库';
      case 'query_contracts':
        return '查询合同';
      case 'query_suppliers':
        return '查询供应商';
      case 'query_invoices':
        return '查询发票';
      default:
        return '执行工具调用';
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
    // usage 是给审计记账的，不进 LLM 上下文——否则既污染提示词、又凭空多花 token
    const payload: ToolResult = { ...result };
    delete payload.usage;

    let json = JSON.stringify(payload);
    if (json.length <= AiService.TOOL_RESULT_MAX_CHARS) return json;

    // 数组结果：截断到前 N 条
    const data = payload.data as any;
    if (Array.isArray(data)) {
      const truncated = data.slice(0, AiService.TOOL_RESULT_MAX_ARRAY);
      const slim = {
        ...payload,
        data: truncated,
        _truncated: `结果已截断，共 ${data.length} 条，仅展示前 ${AiService.TOOL_RESULT_MAX_ARRAY} 条`,
      };
      json = JSON.stringify(slim);
    } else if (data && typeof data === 'object') {
      // 对象结果：精简到成功标志 + 截断标记，避免回填巨量详情
      const slim = {
        success: payload.success,
        error: payload.error,
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
    // NC-2：无可用 provider（未配置/找不到）→ 可执行码而非裸 500（CR-5 细节只进日志）
    console.warn(`[AiService] No provider available: ${errors.join('; ')}`);
    throw BusinessException.of('LLM_UNAVAILABLE');
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
        const fallbackResult = await this.tryFallback(
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
        currentProvider = this.providerFactory.getProvider(fallbackResult.providerName);
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
            this.auditService.log({
              userId: params.userId,
              conversationId: params.conversationId,
              action: 'tool_call',
              detail: `${tc.name}(${tc.arguments})`,
              // T5 跨入口一致：B 路径 proxy 工具经非流式也标 source=bridge（对齐 stream :1415）
              source: this.toolExecution.isProxyTool(tc.name) ? 'bridge' : undefined,
              provider: currentProviderName,
              isError: !resolvedResult.success,
              errorMessage: resolvedResult.error,
              // 工具内部自调 LLM 时（如 summarize_customer_360）的开销记在工具自己这行
              promptTokens: resolvedResult.usage?.promptTokens,
              completionTokens: resolvedResult.usage?.completionTokens,
              // §internal.16 A-1 业务行为取证：业务事件名 + Decision Evidence（链外列）
              businessEvent: deriveAiBusinessEvent(tc.name) ?? undefined,
              evidence: captureDecisionEvidence(tc.name, resolvedResult) ?? undefined,
              authorization: authz ? buildAllowSnapshot(tc.name, authz) : undefined,
            });
          }

          messages.push({
            role: 'tool',
            content: this.truncateToolResult(resolvedResult),
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
          if (await this._shouldAudit('tool')) {
            this.auditService.log({
              userId: params.userId,
              conversationId: params.conversationId,
              action: 'tool_call',
              detail: `${tc.name}(${tc.arguments})`,
              // T5 跨入口一致：B 路径 proxy 工具 deny 也标 source=bridge（对齐成功分支与 stream）
              source: this.toolExecution.isProxyTool(tc.name) ? 'bridge' : undefined,
              provider: currentProviderName,
              isError: true,
              errorMessage: deniedMsg,
              authorization: denied ? JSON.stringify(err.reasons) : undefined,
            });
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
          `[AiService] Fallback provider "${name}" also failed:`, // codeql[js/tainted-format-string] 固定前缀模板，消息作参数不被解释为格式串
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
          `[AiService] Streaming provider "${name}" failed:`, // codeql[js/tainted-format-string] 固定前缀模板，消息作参数不被解释为格式串
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
