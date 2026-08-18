import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 异步队列模块：BullMQ（Redis 复用 REDIS_URL），仅提供 Queue（生产者用）。
 * 消费端 worker 在 PushWorkerModule（仅生产引入，避免测试环境启动连 Redis 挂起）。
 * QUEUE_ENABLED=false 时降级同步执行（生产端判断）。
 *
 * register() 动态注册：QUEUE_ENABLED !== 'false' 才挂 BullMQ——测试环境（createTestApp 置
 * QUEUE_ENABLED=false）完全不建立 Redis 连接，避免 BullMQ Queue 连 Redis 阻塞/重试导致 e2e
 * 挂起（CI 无 Redis 时曾使广播用例 >120s 超时 + app.close 挂起）。
 */
@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const enabled = String(process.env.QUEUE_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      return { module: QueueModule, imports: [], exports: [] };
    }
    return {
      module: QueueModule,
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
    };
  }
}
