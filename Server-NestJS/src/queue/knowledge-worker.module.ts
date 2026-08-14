import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { KnowledgeIngestionProcessor } from './knowledge.processor';

/**
 * knowledge 队列消费端模块：注册 KnowledgeIngestionProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 启动连 Redis 挂起。
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'knowledge' }), AiModule],
  providers: [KnowledgeIngestionProcessor],
})
export class KnowledgeWorkerModule {}
