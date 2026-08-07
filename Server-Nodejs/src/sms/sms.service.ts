import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from './sms.constants';

/**
 * 短信服务 — 发送验证码短信。
 *
 * 注入 SMS_PROVIDER（按 SMS_DRIVER 选择）。当前仅 console 驱动（验证码打印日志，
 * 本地开发/测试用）；aliyun 等真实服务商凭据到位后补驱动，降级语义同 MailService
 * （配置缺失/未知驱动不抛错，仅记录）。
 */
export interface SmsProvider {
  send(phone: string, content: string): Promise<void>;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider | null,
    private readonly configService: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.provider != null;
  }

  get driver(): string {
    return this.configService.get<string>('SMS_DRIVER', 'console');
  }

  /**
   * 发送验证码短信。provider 缺失时仅记录日志，不抛错（业务不阻断）。
   */
  async sendVerificationCode(phone: string, code: string): Promise<void> {
    if (!this.provider) {
      this.logger.warn(`[SMS] no provider configured, skip send to ${phone}`);
      return;
    }
    await this.provider.send(phone, `【ShiYu-AppBase】您的验证码是 ${code}，10 分钟内有效。`);
    this.logger.log(`[SMS] sent code to ${phone}`);
  }
}
