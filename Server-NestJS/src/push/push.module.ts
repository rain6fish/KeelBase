// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PUSH_SERVICE } from './push.service';
import { NoopPushService } from './noop-push.service';
import { JPushService } from './jpush.service';
import { PushToken } from './push-token.entity';
import { PushTokenService } from './push-token.service';
import { PushTokenController } from './push-token.controller';
import { WxSubscribeService } from './wx-subscribe.service';
import { User } from '../common/entities/user.entity';

/**
 * 推送模块：按 PUSH_DRIVER（none 默认 / jpush）提供推送实现 + 设备 token 注册表
 * + MINI-2 微信订阅消息（WxSubscribeService，未配置凭据降级）。
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PushToken, User])],
  controllers: [PushTokenController],
  providers: [
    PushTokenService,
    WxSubscribeService,
    {
      provide: PUSH_SERVICE,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('PUSH_DRIVER', 'none');
        if (driver === 'jpush') {
          const svc = new JPushService(configService);
          // 无凭据视为降级
          if (svc.enabled) return svc;
        }
        return new NoopPushService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [PUSH_SERVICE, PushTokenService, WxSubscribeService],
})
export class PushModule {}
