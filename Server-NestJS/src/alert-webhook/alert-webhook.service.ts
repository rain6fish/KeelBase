// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AlertWebhookType = 'dingtalk' | 'feishu' | 'slack';

/**
 * 异常告警 Webhook（RG-4）：500/致命异常主动推送钉钉/飞书/Slack 群。
 * 含防抖：ALERT_WEBHOOK_MIN_INTERVAL_SECONDS 内只发一条，避免告警风暴。
 */
@Injectable()
export class AlertWebhookService {
  private readonly logger = new Logger(AlertWebhookService.name);
  private readonly enabled: boolean;
  private readonly url: string;
  private readonly type: AlertWebhookType;
  private readonly minIntervalMs: number;
  private lastSentAt = 0;
  private suppressedCount = 0;

  constructor(
    configService: ConfigService,
    @Optional() private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.enabled = configService.get<boolean>('ALERT_WEBHOOK_ENABLED', false);
    this.url = configService.get<string>('ALERT_WEBHOOK_URL', '');
    const type = configService.get<string>('ALERT_WEBHOOK_TYPE', 'dingtalk');
    this.type = (['dingtalk', 'feishu', 'slack'].includes(type) ? type : 'dingtalk') as AlertWebhookType;
    const secs = configService.get<number>('ALERT_WEBHOOK_MIN_INTERVAL_SECONDS', 60);
    this.minIntervalMs = Math.max(secs, 1) * 1000;
  }

  get configured(): boolean {
    return this.enabled && !!this.url;
  }

  /**
   * 发送告警。未配置时静默跳过；防抖期内丢弃并计数。
   */
  async sendAlert(title: string, message: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.configured) return;

    const now = Date.now();
    if (now - this.lastSentAt < this.minIntervalMs) {
      this.suppressedCount += 1;
      return;
    }
    this.lastSentAt = now;

    const text = `[KeelBase]\n${title}\n${message}${meta ? `\n${JSON.stringify(meta)}` : ''}`;
    const body = this._buildBody(text);

    try {
      await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (this.suppressedCount > 0) {
        this.logger.warn(`[AlertWebhook] suppressed ${this.suppressedCount} alerts during debounce`);
        this.suppressedCount = 0;
      }
    } catch (err) {
      this.logger.error(`[AlertWebhook] send failed: ${(err as Error).message}`);
    }
  }

  private _buildBody(text: string): Record<string, unknown> {
    switch (this.type) {
      case 'feishu':
        return { msg_type: 'text', content: { text } };
      case 'slack':
        return { text };
      case 'dingtalk':
      default:
        return { msgtype: 'text', text: { content: text } };
    }
  }
}
