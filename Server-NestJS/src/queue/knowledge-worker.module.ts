import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { KnowledgeIngestionProcessor } from './knowledge.processor';

/**
 * knowledge 队列消费端模块：注册 KnowledgeIngestionProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 启动连 Redis 挂起。
 * register() 动态注册：QUEUE_ENABLED=false 时不注册 worker（与 QueueModule.register() 一致）。
 */
@Module({})
export class KnowledgeWorkerModule {
  static register(): DynamicModule {
    const enabled = String(process.env.QUEUE_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      return { module: KnowledgeWorkerModule, imports: [], providers: [] };
    }
    return {
      module: KnowledgeWorkerModule,
      imports: [BullModule.registerQueue({ name: 'knowledge' }), AiModule],
      providers: [KnowledgeIngestionProcessor],
    };
  }
}
