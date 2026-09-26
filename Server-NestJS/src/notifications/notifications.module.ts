// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from './notification.entity';
import { PushModule } from '../push/push.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  // RealtimeModule 是普通 import，不需要 forwardRef：它只依赖 Config / Jwt / FeatureFlags，
  // 绕不回本模块（早年它 import AiModule 才成环，那条边已由 gateway 的 ModuleRef 延迟获取切断）。
  imports: [TypeOrmModule.forFeature([Notification]), PushModule, QueueModule.register(), RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
