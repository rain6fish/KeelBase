// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
import { isBlockedHost } from '../common/utils/ssrf';
import { AlertWebhookService } from '../alert-webhook/alert-webhook.service';
import { WebhookSubscription } from './webhook-subscription.entity';

export interface WebhookRetryConfig {
  attempts: number;
  backoffMs: number;
}

const DEFAULT_RETRY: WebhookRetryConfig = { attempts: 3, backoffMs: 1000 };

export interface WebhookSubscriptionView {
  id: number;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
}

/** 触发方依赖的接口（业务 service 用 @Optional 注入 WebhookService）。 */
export interface WebhookPublisher {
  publish(eventType: string, payload: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class WebhookService implements WebhookPublisher {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly repo: Repository<WebhookSubscription>,
    @Optional() private readonly retryConfig?: WebhookRetryConfig,
    @Optional() private readonly alertWebhook?: AlertWebhookService,
  ) {}

  async subscribe(
    userId: number,
    input: { name: string; url: string; events: string[] },
  ): Promise<WebhookSubscriptionView> {
    const secret = randomBytes(32).toString('hex');
    const sub = await this.repo.save(
      this.repo.create({
        userId,
        name: input.name,
        url: input.url,
        eventsJson: JSON.stringify(input.events),
        secret,
      }),
    );
    return this._view(sub);
  }

  async list(userId: number): Promise<WebhookSubscriptionView[]> {
    const rows = await this.repo.find({ where: { userId }, order: { id: 'ASC' } });
    return rows.map((r) => this._view(r));
  }

  async remove(userId: number, id: number): Promise<{ removed: boolean }> {
    const res = await this.repo.delete({ id, userId });
    return { removed: (res.affected ?? 0) > 0 };
  }

  async setEnabled(userId: number, id: number, enabled: boolean): Promise<WebhookSubscriptionView | null> {
    const sub = await this.repo.findOne({ where: { id, userId } });
    if (!sub) return null;
    sub.enabled = enabled;
    return this._view(await this.repo.save(sub));
  }

  /**
   * PL-14 投递：匹配启用且订阅了该事件类型的 webhook，
   * 用各自 secret 做 HMAC-SHA256 签名后 POST（带指数退避重试）。
   * 重试耗尽**不阻断业务，但也不再静默**：走既有告警通道（REL-2）。
   * 完整异步重试队列（BullMQ worker）留待量大后。
   */
  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const subs = await this.repo.find({ where: { enabled: true } });
    const matches = subs.filter((s) => this._eventsOf(s).includes(eventType));
    for (const sub of matches) {
      const body = JSON.stringify({ event: eventType, ...payload });
      const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
      const result = await this._deliver(sub.url, eventType, body, signature);
      if (!result.delivered) this._alertDeliveryFailure(eventType, sub.url, result.error ?? 'unknown error');
    }
  }

  /**
   * REL-2：投递最终失败**不得静默**。原先 `_deliver` 的返回值被直接丢弃，失败只剩一行 warn，
   * 而调用方还会 `.catch(() => undefined)` 再吞一层——于是一个订阅端点挂掉不留任何可查痕迹。
   * 现在复用既有告警通道（与 500 异常同一条，见 `common/filters/http-exception.filter.ts`）。
   *
   * **只带主机名、不带完整 URL**：webhook 端点常在查询串里嵌令牌（钉钉/飞书机器人即如此），
   * 而告警目标是**第三方 SaaS**——带完整 URL 等于把这些令牌送出本域。日志里仍保留完整 URL（与既有行为一致）。
   *
   * 边界（如实记）：`ALERT_WEBHOOK_ENABLED` 默认 false ⇒ 未配置告警时仍只剩那条 warn。
   * 「无论配置都能列出失败」需另做失败记录表 + 端点，本项未做。
   */
  private _alertDeliveryFailure(eventType: string, url: string, error: string): void {
    const alert = this.alertWebhook;
    if (!alert) return;
    // URL 在 _deliver 里已成功解析过（SSRF 分支与重试耗尽都发生在解析之后），此处不再兜底
    const host = new URL(url).host;
    void alert
      .sendAlert('Webhook 投递失败', `${eventType} → ${host}：${error}`, { eventType, host })
      .catch(() => undefined);
  }

  /** 测试投递：向单个订阅发测试 payload，返回签名（供调用方展示）。 */
  async testDeliver(userId: number, id: number): Promise<{ delivered: boolean; signature?: string; error?: string }> {
    const sub = await this.repo.findOne({ where: { id, userId } });
    if (!sub) return { delivered: false, error: 'Webhook not found' };
    const payload = { event: 'webhook.test', message: 'KeelBase webhook test' };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
    const ok = await this._deliver(sub.url, 'webhook.test', body, signature);
    return { delivered: ok.delivered, signature, error: ok.delivered ? undefined : ok.error };
  }

  /** 投递 + 指数退避重试。returns 是否最终成功。 */
  private async _deliver(
    url: string,
    eventType: string,
    body: string,
    signature: string,
  ): Promise<{ delivered: boolean; error?: string }> {
    // SSRF 防护：投递目标解析后不得是私网/回环/链接本地（含云元数据 169.254.169.254）
    const hostname = new URL(url).hostname;
    if (await this._isBlockedHost(hostname)) {
      this.logger.warn(`[Webhook] blocked SSRF target: ${hostname}`);
      return { delivered: false, error: '目标地址为内网/回环/链接本地，已阻止（防 SSRF）' };
    }
    const cfg = this.retryConfig ?? DEFAULT_RETRY;
    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
      try {
        const res = await this._fetchWithRedirectGuard(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': eventType,
            'X-Webhook-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return { delivered: true };
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = (err as Error).message;
        if (lastError === 'ssrf-blocked') break; // 目标（含重定向）为私网，重试无意义
      }
      if (attempt < cfg.attempts) {
        await new Promise((r) => setTimeout(r, cfg.backoffMs * attempt));
      }
    }
    this.logger.warn(`[Webhook] deliver ${eventType} -> ${url} failed after ${cfg.attempts} attempts: ${lastError}`);
    return { delivered: false, error: lastError };
  }

  /** SSRF：hostname 解析后任一地址落在私网/回环/链接本地（IPv4/IPv6）即阻止；解析失败保守阻止（复用 common/utils/ssrf）。 */
  private _isBlockedHost(hostname: string): Promise<boolean> {
    return isBlockedHost(hostname);
  }

  /**
   * SSRF 加固（W4-④ 后补）：fetch 默认 follow 重定向，攻击者可注册公网 302 端点
   * 重定向到私网/云元数据地址绕过 _isBlockedHost。此处 redirect:'manual' 并逐跳
   * 复用 _isBlockedHost 校验每个重定向目标；超限抛错防重定向环。
   */
  private async _fetchWithRedirectGuard(
    url: string,
    init: RequestInit,
    maxHops = 5,
  ): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= maxHops; hop++) {
      const hostname = new URL(current).hostname;
      if (await this._isBlockedHost(hostname)) throw new Error('ssrf-blocked');
      const res = await fetch(current, { ...init, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) return res;
        current = new URL(location, current).toString();
        continue;
      }
      return res;
    }
    throw new Error('too-many-redirects');
  }

  private _eventsOf(sub: WebhookSubscription): string[] {
    try {
      const parsed = JSON.parse(sub.eventsJson);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  private _view(sub: WebhookSubscription): WebhookSubscriptionView {
    return {
      id: sub.id,
      name: sub.name,
      url: sub.url,
      events: this._eventsOf(sub),
      enabled: sub.enabled,
      createdAt: sub.createdAt,
    };
  }
}
