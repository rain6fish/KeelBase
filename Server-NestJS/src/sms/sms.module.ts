// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from './sms.constants';
import { SmsService } from './sms.service';
import { ConsoleSmsProvider } from './console-sms.provider';

/**
 * 短信模块 — 按 SMS_DRIVER 选择驱动。
 * 未知驱动/无凭据 → 注册 null（SmsService 降级为日志，不阻断业务）。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SMS_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('SMS_DRIVER', 'console');
        if (driver === 'console') {
          return new ConsoleSmsProvider();
        }
        // 真实服务商凭据到位后在此分支实例化对应驱动
        return null;
      },
      inject: [ConfigService],
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
