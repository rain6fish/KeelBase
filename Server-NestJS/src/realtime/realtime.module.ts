// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    ConfigModule,
    // 自包含 JwtModule（同 auth.module.ts 的 secret 模式），供 WS 握手校验；不依赖 AuthModule 的 TypeORM 重依赖
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    // 不 import AiModule：AiService 由 gateway 经 ModuleRef 延迟获取（strict:false），
    // 避免 AiModule→OrgModule→NotificationsModule→RealtimeModule 的模块依赖环
    FeatureFlagsModule,
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
