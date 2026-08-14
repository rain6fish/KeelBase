import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/event.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderProcessor } from './reminder.processor';

/**
 * reminder 队列消费端模块：注册 ReminderProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 连 Redis 挂起。
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'reminder' }),
    TypeOrmModule.forFeature([Event]),
    NotificationsModule,
  ],
  providers: [ReminderProcessor],
})
export class ReminderWorkerModule {}
