import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
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
   * 重试耗尽仅记日志，不阻断业务。完整异步重试队列（BullMQ worker）留待量大后。
   */
  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const subs = await this.repo.find({ where: { enabled: true } });
    const matches = subs.filter((s) => this._eventsOf(s).includes(eventType));
    for (const sub of matches) {
      const body = JSON.stringify({ event: eventType, ...payload });
      const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
      await this._deliver(sub.url, eventType, body, signature);
    }
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
    const cfg = this.retryConfig ?? DEFAULT_RETRY;
    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
      try {
        const res = await fetch(url, {
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
      }
      if (attempt < cfg.attempts) {
        await new Promise((r) => setTimeout(r, cfg.backoffMs * attempt));
      }
    }
    this.logger.warn(`[Webhook] deliver ${eventType} -> ${url} failed after ${cfg.attempts} attempts: ${lastError}`);
    return { delivered: false, error: lastError };
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
