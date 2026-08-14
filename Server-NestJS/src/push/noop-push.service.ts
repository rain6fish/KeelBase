import { Injectable, Logger } from '@nestjs/common';
import { PushPayload, PushService } from './push.service';

/**
 * 推送未配置时的降级实现：记录日志，不实际发送。
 * 语义同 MailService（provider 未配置 → no-op）。
 */
@Injectable()
export class NoopPushService implements PushService {
  private readonly logger = new Logger(NoopPushService.name);

  async sendToDevice(deviceToken: string, payload: PushPayload): Promise<void> {
    this.logger.log(
      `[Push] disabled — skip to device ${deviceToken?.slice(0, 8)}... (${payload.title})`,
    );
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<void> {
    this.logger.log(`[Push] disabled — skip to topic ${topic} (${payload.title})`);
  }
}
