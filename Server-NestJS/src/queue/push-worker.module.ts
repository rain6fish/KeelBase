import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PushModule } from '../push/push.module';
import { PushProcessor } from './push.processor';

/**
 * push 队列消费端模块：注册 PushProcessor worker。
 * 仅生产 app.module 引入——测试环境不引入，避免 worker 启动连 Redis 挂起。
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'push' }), PushModule],
  providers: [PushProcessor],
})
export class PushWorkerModule {}
