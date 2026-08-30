import { Injectable } from '@nestjs/common';

/**
 * 治理 sidecar 服务（S-1 MVP）：
 * - 拦截业务系统 LLM 请求（OpenAI 兼容）
 * - 上报治理台审计（请求元数据 + 响应 tokens/耗时）——AI 流量可见性（零代码接入）
 * - 转发真实 LLM（SIDECAR_UPSTREAM_URL）
 * 工具调用门控/确认（S-2）后续复用 MCP 网关门控模式。
 */
@Injectable()
export class SidecarService {
  private readonly upstream: string;
  private readonly govUrl: string;
  private readonly govKey: string;

  constructor() {
    this.upstream = process.env.SIDECAR_UPSTREAM_URL || 'https://api.deepseek.com';
    this.govUrl = process.env.GOVERNANCE_URL || '';
    this.govKey = process.env.GOVERNANCE_API_KEY || '';
  }

  /** 拦截 + 上报 + 转发真实 LLM */
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

    // 转发真实 LLM
    const res = await fetch(`${this.upstream}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: process.env.SIDECAR_UPSTREAM_KEY ? `Bearer ${process.env.SIDECAR_UPSTREAM_KEY}` : '' },
      body: JSON.stringify(body),
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

    return json;
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
