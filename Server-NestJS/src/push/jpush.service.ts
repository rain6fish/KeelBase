import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushPayload, PushService } from './push.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

const JPUSH_API = 'https://api.jpush.cn/v3/push';

/**
 * 极光推送（JPush）REST API v3。
 * 认证：HTTP Basic（appKey:masterSecret base64）。
 * 未配置 appKey/masterSecret 时视为降级（同 MailService enabled 语义）。
 */
@Injectable()
export class JPushService implements PushService {
  private readonly logger = new Logger(JPushService.name);
  private readonly appKey: string;
  private readonly masterSecret: string;

  constructor(
    configService: ConfigService,
    @Optional() private readonly circuitBreaker?: CircuitBreakerService,
  ) {
    this.appKey = configService.get<string>('JPUSH_APP_KEY', '');
    this.masterSecret = configService.get<string>('JPUSH_MASTER_SECRET', '');
  }

  get enabled(): boolean {
    return !!this.appKey && !!this.masterSecret;
  }

  async sendToDevice(deviceToken: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`[JPush] disabled — skip to ${deviceToken?.slice(0, 8)}...`);
      return;
    }
    const body = this._buildBody(
      { registration_id: [deviceToken] },
      payload,
    );
    await this._post(body);
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`[JPush] disabled — skip to tag ${topic}`);
      return;
    }
    const body = this._buildBody({ tag: [topic] }, payload);
    await this._post(body);
  }

  private _buildBody(
    audience: Record<string, string[]>,
    payload: PushPayload,
  ): Record<string, unknown> {
    const extras = payload.data;
    return {
      platform: 'all',
      audience,
      notification: {
        alert: payload.title,
        android: {
          title: payload.title,
          alert: payload.body,
          ...(extras ? { extras } : {}),
        },
        ios: {
          alert: payload.title,
          ...(extras ? { extras } : {}),
        },
      },
    };
  }

  private async _post(body: Record<string, unknown>): Promise<void> {
    const doPost = async () => {
      const auth = Buffer.from(`${this.appKey}:${this.masterSecret}`).toString('base64');
      const response = await fetch(JPUSH_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`JPush API error: ${response.status} ${errorBody}`);
      }
      const data = (await response.json()) as { msg_id?: string };
      this.logger.log(`[JPush] sent, msg_id=${data.msg_id}`);
    };
    if (this.circuitBreaker) {
      await this.circuitBreaker.fire('jpush', doPost);
    } else {
      await doPost();
    }
  }
}
