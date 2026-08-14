import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PUSH_SERVICE } from './push.service';
import { NoopPushService } from './noop-push.service';
import { JPushService } from './jpush.service';
import { PushToken } from './push-token.entity';
import { PushTokenService } from './push-token.service';
import { PushTokenController } from './push-token.controller';

/**
 * 推送模块：按 PUSH_DRIVER（none 默认 / jpush）提供推送实现 + 设备 token 注册表。
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PushToken])],
  controllers: [PushTokenController],
  providers: [
    PushTokenService,
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
  exports: [PUSH_SERVICE, PushTokenService],
})
export class PushModule {}
