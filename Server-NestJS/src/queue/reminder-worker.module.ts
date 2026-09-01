// SPDX-License-Identifier: Apache-2.0

import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/event.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { ReminderProcessor } from './reminder.processor';

/**
 * reminder 队列消费端模块：注册 ReminderProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 连 Redis 挂起。
 * register() 动态注册：QUEUE_ENABLED=false 时不注册 worker（与 QueueModule.register() 一致）。
 */
@Module({})
export class ReminderWorkerModule {
  static register(): DynamicModule {
    const enabled = String(process.env.QUEUE_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      return { module: ReminderWorkerModule, imports: [], providers: [] };
    }
    return {
      module: ReminderWorkerModule,
      imports: [
        BullModule.registerQueue({ name: 'reminder' }),
        TypeOrmModule.forFeature([Event]),
        NotificationsModule,
        PushModule, // MINI-2：WxSubscribeService（事件提醒订阅消息）
      ],
      providers: [ReminderProcessor],
    };
  }
}
