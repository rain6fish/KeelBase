// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms.service';

/**
 * console 短信驱动：验证码打印到日志（本地开发/测试）。
 * 生产接入真实服务商时替换为 aliyun/tencent 驱动（实现 SmsProvider 接口）。
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SmsProvider:console');

  async send(phone: string, content: string): Promise<void> {
    this.logger.log(`[SMS] → ${phone}: ${content}`);
  }
}
