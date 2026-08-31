import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SidecarToolRegistry, type SidecarToolDef, type ToolDecision, type ToolOverride } from './sidecar-tool-registry';

/**
 * 治理 sidecar（护城河 2.0 嵌入广度）：
 * - S-1：拦截业务系统 LLM 请求（OpenAI 兼容），上报治理台审计 + 转发真实 LLM
 * - S-2：工具调用门控（对齐 ai-governance-protocol.md §4 风险分级）——
 *   R5 阻断 / R3-R4 确认（hold-and-release）/ R0-R2 自动；治理台策略覆盖实时生效
 * 零代码接入：业务系统 LLM base URL → http://sidecar:3200/v1
 */
@Injectable()
export class SidecarService {
  private readonly upstream: string;
  private readonly govUrl: string;
  private readonly govKey: string;
  private readonly registry: SidecarToolRegistry;
  private readonly confirmTtlMs: number;

  /** hold-and-release 确认暂存：token → 原响应（含 tool_calls） */
  private readonly held = new Map<
    string,
    { response: Record<string, unknown>; tools: string[]; expiresAt: number }
  >();

  constructor() {
    this.upstream = process.env.SIDECAR_UPSTREAM_URL || 'https://api.deepseek.com';
    this.govUrl = process.env.GOVERNANCE_URL || '';
    this.govKey = process.env.GOVERNANCE_API_KEY || '';
    const defs = SidecarService.parseTools(process.env.SIDECAR_TOOLS);
    this.registry = new SidecarToolRegistry(defs, process.env.SIDECAR_DEFAULT_TOOL_RISK || 'R1');
    this.confirmTtlMs = parseInt(process.env.SIDECAR_CONFIRM_TTL_SECONDS || '300', 10) * 1000;

    // 治理台策略实时生效：启动拉一次 + 周期刷新（对齐 D2-3 策略下发）
    void this.refreshPolicy();
    const refreshSec = parseInt(process.env.SIDECAR_POLICY_REFRESH_SECONDS || '60', 10);
    setInterval(() => void this.refreshPolicy(), refreshSec * 1000).unref();
    setInterval(() => this.purgeHeld(), this.confirmTtlMs).unref();

    // B2：启动时向治理台注册回调（SIDECAR_CALLBACK_URL），策略变更秒级推送；注册失败/重启由 60s 轮询兜底
    const callbackUrl = process.env.SIDECAR_CALLBACK_URL || '';
    if (callbackUrl && this.govUrl) void this.registerCallback(callbackUrl);
  }

  /** 拦截 + 上报 + 转发真实 LLM + 工具门控（S-2） */
  async proxyChat(body: Record<string, unknown>, userId?: string): Promise<unknown> {
    const startedAt = Date.now();
    const uid = userId || 'sidecar';
    const model = (body.model as string) || 'unknown';
    const messageSummary = this.summarizeMessages(body.messages);

    // 请求上报（fire-and-forget，不阻塞转发）
    void this.reportAudit({
      userId: uid,
      username: 'sidecar',
      action: 'chat',
      detail: `sidecar:${model} ${messageSummary}`,
      model,
      provider: 'sidecar',
      source: 'sidecar',
    });

    // 转发真实 LLM（超时 120s，防上游挂起导致代理请求无限阻塞）
    const res = await fetch(`${this.upstream}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: process.env.SIDECAR_UPSTREAM_KEY ? `Bearer ${process.env.SIDECAR_UPSTREAM_KEY}` : '' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      void this.reportAudit({
        userId: uid,
        username: 'sidecar',
        action: 'error',
        detail: `sidecar upstream ${res.status}: ${errText.slice(0, 200)}`,
        model,
        provider: 'sidecar',
        isError: true,
        errorMessage: `upstream ${res.status}`,
        durationMs: Date.now() - startedAt,
        source: 'sidecar',
      });
      throw new Error(`sidecar upstream error ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;

    // S-2：工具调用门控
    const gated = this.gateToolCalls(json, uid, model);

    // 响应上报（tokens/耗时）
    void this.reportAudit({
      userId: uid,
      username: 'sidecar',
      action: 'chat',
      detail: `sidecar:${model} response`,
      model,
      provider: 'sidecar',
      promptTokens: (json.usage as Record<string, number> | undefined)?.prompt_tokens,
      completionTokens: (json.usage as Record<string, number> | undefined)?.completion_tokens,
      durationMs: Date.now() - startedAt,
      source: 'sidecar',
    });

    return gated;
  }

  /** 批准/拒绝暂存的工具调用（S-2 确认）：approve 返回原响应（含 tool_calls），reject 返回拒绝响应 */
  confirm(token: string, decision: 'approve' | 'reject', userId?: string): Record<string, unknown> {
    const held = this.held.get(token);
    if (!held || held.expiresAt < Date.now()) {
      this.held.delete(token);
      throw new NotFoundException('confirmation token 不存在或已过期');
    }
    this.held.delete(token);
    const toolLabel = held.tools.join(', ');
    if (decision === 'approve') {
      void this.reportAudit({
        userId: userId || 'sidecar',
        username: 'sidecar',
        action: 'confirmation',
        detail: `tool:${toolLabel} decision:approved`,
        provider: 'sidecar',
        source: 'sidecar',
      });
      return held.response;
    }
    void this.reportAudit({
      userId: userId || 'sidecar',
      username: 'sidecar',
      action: 'confirmation',
      detail: `tool:${toolLabel} decision:rejected`,
      provider: 'sidecar',
      source: 'sidecar',
    });
    return SidecarService.blockedResponse(held.response, [`${toolLabel}（人工拒绝）`]);
  }

  /** 待确认项（诊断/管理用） */
  pendingConfirmations(): Array<{ token: string; tools: string[]; expiresAt: number }> {
    this.purgeHeld();
    return [...this.held.entries()].map(([token, h]) => ({ token, tools: h.tools, expiresAt: h.expiresAt }));
  }

  /** 治理台策略拉取（GET /api/v1/external/governance/policy，服务身份） */
  private async refreshPolicy(): Promise<void> {
    if (!this.govUrl) return;
    try {
      const res = await fetch(`${this.govUrl}/api/v1/external/governance/policy`, {
        headers: { 'x-api-key': this.govKey },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const body = (await res.json()) as Record<string, unknown>;
      this.registry.setPolicy((body?.data as Record<string, unknown> | undefined) ?? body);
    } catch {
      /* 治理台不可达：沿用本地 SIDECAR_TOOLS 风险级 */
    }
  }

  /** B2：向治理台注册回调（fire-and-forget；失败静默，靠轮询兜底） */
  private async registerCallback(callbackUrl: string): Promise<void> {
    try {
      await fetch(`${this.govUrl}/api/v1/external/governance/sidecars/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.govKey },
        body: JSON.stringify({ callbackUrl }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* 治理台不可达：靠轮询兜底 */
    }
  }

  /** B2：接收治理台策略推送（实时生效），返回确认 */
  applyPushedPolicy(policy: unknown, pushedAt?: string): { accepted: boolean; pushedAt?: string } {
    this.registry.setPolicy((policy ?? null) as { tools?: Record<string, ToolOverride> } | null);
    return { accepted: true, pushedAt };
  }

  /**
   * S-2 门控：解析响应 tool_calls 并应用策略——
   * 全部 auto → 原样返回；任一 block → 全部改写为拒绝（R5 绝对优先）；
   * 任一 confirm（且无 block）→ hold 原响应，返回确认标记（业务系统批准后取回）。
   */
  private gateToolCalls(
    json: Record<string, unknown>,
    uid: string,
    model: string,
  ): Record<string, unknown> {
    const toolCalls = this.extractToolCalls(json);
    if (toolCalls.length === 0) return json;

    const classified = toolCalls.map((tc) => {
      const name = tc.function?.name || 'unknown';
      const d = this.registry.decide(name);
      void this.reportToolAudit(uid, model, name, tc, d);
      return { tc, name, d };
    });

    const blocked = classified.filter((x) => x.d.decision === 'block');
    if (blocked.length > 0) {
      const reasons = blocked.map((x) => `${x.name}(${x.d.risk})`);
      return SidecarService.blockedResponse(json, reasons);
    }

    const confirm = classified.filter((x) => x.d.decision === 'confirm');
    if (confirm.length > 0) {
      const token = randomBytes(16).toString('hex');
      this.held.set(token, {
        response: json,
        tools: confirm.map((x) => x.name),
        expiresAt: Date.now() + this.confirmTtlMs,
      });
      const marker = SidecarService.confirmationMarker(json, token, confirm.map((x) => x.name));
      void this.reportAudit({
        userId: uid,
        username: 'sidecar',
        action: 'confirmation',
        detail: `pending:${confirm.map((x) => x.name).join(',')} token:${token.slice(0, 8)}…`,
        model,
        provider: 'sidecar',
        source: 'sidecar',
      });
      return marker;
    }

    return json; // 全部 auto：放行
  }

  /** 单工具审计（source=sidecar，action=tool_call） */
  private reportToolAudit(
    uid: string,
    model: string,
    name: string,
    tc: { function?: { arguments?: string } },
    d: ToolDecision,
  ): void {
    const argsSummary = String(tc.function?.arguments ?? '').slice(0, 120);
    void this.reportAudit({
      userId: uid,
      username: 'sidecar',
      action: 'tool_call',
      detail: `tool:${name} risk:${d.risk} decision:${d.decision} args:${argsSummary}`,
      model,
      provider: 'sidecar',
      source: 'sidecar',
    });
  }

  private extractToolCalls(json: Record<string, unknown>): Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }> {
    const msg = (json.choices as Array<{ message?: { tool_calls?: unknown } }> | undefined)?.[0]?.message;
    return Array.isArray(msg?.tool_calls) ? (msg.tool_calls as Array<never>) : [];
  }

  /** 阻断响应：清空 tool_calls，注入拒绝说明 */
  private static blockedResponse(
    json: Record<string, unknown>,
    reasons: string[],
  ): Record<string, unknown> {
    const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
    if (!choice) return json;
    return {
      ...json,
      choices: [
        {
          ...choice,
          message: {
            ...(choice.message as Record<string, unknown>),
            tool_calls: null,
            content: `工具调用被治理策略阻断：${reasons.join('；')}（sidecar R5/策略禁用，未执行）。`,
          },
          finish_reason: 'stop',
        },
      ],
    };
  }

  /** 确认标记响应：剥离 tool_calls，附 confirmation token 供业务系统批准后取回原响应 */
  private static confirmationMarker(
    json: Record<string, unknown>,
    token: string,
    toolNames: string[],
  ): Record<string, unknown> {
    const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
    return {
      ...json,
      choices: [
        {
          ...choice,
          message: {
            role: 'assistant',
            content: `工具调用需治理确认：${toolNames.join(', ')}。批准后系统将返回原工具调用（POST /v1/confirmations/${token} { decision: "approve" }）。`,
            tool_calls: null,
            confirmation: { token, tools: toolNames },
          },
          finish_reason: 'tool_calls',
        },
      ],
    };
  }

  private static parseTools(raw?: string): SidecarToolDef[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as SidecarToolDef[];
      return Array.isArray(arr) ? arr.filter((t) => t && typeof t.name === 'string') : [];
    } catch {
      return [];
    }
  }

  private purgeHeld(): void {
    const now = Date.now();
    for (const [token, h] of this.held) if (h.expiresAt < now) this.held.delete(token);
  }

  /** 上报治理台 /external/audit（服务身份，失败静默） */
  private reportAudit(entry: Record<string, unknown>): Promise<void> {
    if (!this.govUrl) return Promise.resolve();
    return fetch(`${this.govUrl}/api/v1/external/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.govKey },
      body: JSON.stringify(entry),
    })
      .then(() => undefined)
      .catch(() => undefined);
  }

  /** 消息摘要（首条 user 内容前 60 字符，避免敏感详情全量上报） */
  private summarizeMessages(messages: unknown): string {
    if (!Array.isArray(messages)) return '';
    const first = messages.find((m) => (m as { role?: string })?.role === 'user' || (m as { role?: string })?.role === 'system');
    const content = first ? String((first as { content?: unknown })?.content ?? '').slice(0, 60) : '';
    return content ? `:${content}` : '';
  }
}
