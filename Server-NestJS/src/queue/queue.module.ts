// SPDX-License-Identifier: Apache-2.0

import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 异步队列开关单一来源（queue.module + 三个 worker 模块共用）。
 *
 * 队列**必须**有 Redis，故未配置时默认关闭：零配置启动不建立 Redis 连接，也就不会因连不上而
 * 持续重连、刷 ECONNREFUSED 栈（曾默认开启，2026-09-22 实测 ~4 条/秒）。有 Redis 的部署须显式
 * 设 `QUEUE_ENABLED=true`。关闭时生产者走同步执行路径（各调用点自行判断）。
 *
 * 注：`ConfigModule.forRoot()` 在 app.module `imports` 中先于本模块的 `register()` 求值，会把
 * `.env` 写入 `process.env`，故这里读到的就是用户配置值。
 */
export function isQueueEnabled(): boolean {
  return String(process.env.QUEUE_ENABLED ?? 'false') !== 'false';
}

/**
 * 异步队列模块：BullMQ（Redis 复用 REDIS_URL），仅提供 Queue（生产者用）。
 * 消费端 worker 在 PushWorkerModule（仅生产引入，避免测试环境启动连 Redis 挂起）。
 * QUEUE_ENABLED=false 时降级同步执行（生产端判断）。
 *
 * register() 动态注册：仅开关打开才挂 BullMQ——测试环境（createTestApp 置
 * QUEUE_ENABLED=false）与零配置启动都不建立 Redis 连接，避免 BullMQ Queue 连 Redis
 * 阻塞/重试导致 e2e 挂起（CI 无 Redis 时曾使广播用例 >120s 超时 + app.close 挂起）。
 */
@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const enabled = isQueueEnabled();
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
