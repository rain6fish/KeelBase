import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 异步队列模块：BullMQ（Redis 复用 REDIS_URL），仅提供 Queue（生产者用）。
 * 消费端 worker 在 PushWorkerModule（仅生产引入，避免测试环境启动连 Redis 挂起）。
 * QUEUE_ENABLED=false 时降级同步执行（生产端判断）。
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'push' }),
    BullModule.registerQueue({ name: 'reminder' }),
    BullModule.registerQueue({ name: 'knowledge' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
