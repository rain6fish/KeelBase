import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
import { WebhookSubscription } from './webhook-subscription.entity';

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
   * PL-14 投递：匹配 userId 下启用且订阅了该事件类型的 webhook，
   * 用各自 secret 做 HMAC-SHA256 签名后 POST。失败仅记日志，不阻断业务。
   */
  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const subs = await this.repo.find({ where: { enabled: true } });
    const matches = subs.filter((s) => this._eventsOf(s).includes(eventType));
    for (const sub of matches) {
      const body = JSON.stringify({ event: eventType, ...payload });
      const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
      try {
        await fetch(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': eventType,
            'X-Webhook-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(5_000),
        });
      } catch (err) {
        this.logger.warn(
          `[Webhook] deliver ${eventType} -> ${sub.url} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /** 测试投递：向单个订阅发测试 payload，返回签名（供调用方展示）。 */
  async testDeliver(userId: number, id: number): Promise<{ delivered: boolean; signature?: string; error?: string }> {
    const sub = await this.repo.findOne({ where: { id, userId } });
    if (!sub) return { delivered: false, error: 'Webhook not found' };
    const payload = { event: 'webhook.test', message: 'KeelBase webhook test' };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'webhook.test',
          'X-Webhook-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      return { delivered: res.ok, signature, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return { delivered: false, signature, error: (err as Error).message };
    }
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
