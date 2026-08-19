import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PushModule } from '../push/push.module';
import { PushProcessor } from './push.processor';

/**
 * push 队列消费端模块：注册 PushProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 启动连 Redis 挂起。
 * register() 动态注册：QUEUE_ENABLED=false 时不注册 worker（私有 AI / 降级场景无队列，
 * worker 连 Redis 会 ECONNREFUSED 阻塞启动，与 QueueModule.register() 一致）。
 */
@Module({})
export class PushWorkerModule {
  static register(): DynamicModule {
    const enabled = String(process.env.QUEUE_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      return { module: PushWorkerModule, imports: [], providers: [] };
    }
    return {
      module: PushWorkerModule,
      imports: [BullModule.registerQueue({ name: 'push' }), PushModule],
      providers: [PushProcessor],
    };
  }
}
