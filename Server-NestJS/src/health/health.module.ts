// SPDX-License-Identifier: Apache-2.0

 import { Module } from '@nestjs/common';
 import { ConfigModule } from '@nestjs/config';
 import { HealthController } from './health.controller';
 import { StorageModule } from '../storage/storage.module';
 import { QueueModule } from '../queue/queue.module';

 @Module({
   // QueueModule must be registered here: `@InjectQueue('push')` is provided by BullModule's
   // `registerQueue`, and that dynamic module is not global — only `forRoot` is `@Global()`. Without
   // this line a deployment with the queue enabled and Redis reachable still reported `queue: down`
   // (measured 2026-10-11), which is exactly the "read normal as broken" the three-state design
   // exists to avoid.
   //
   // QueueModule 必须在这里注册：`@InjectQueue('push')` 由 BullModule 的 `registerQueue` 提供，而那个
   // 动态模块不是全局的 —— 只有 `forRoot` 是 `@Global()`。少了这一行，队列已启用且 Redis 可达的部署
   // 仍会报 `queue: down`（2026-10-11 实测），而那正是这个三态设计要避免的「把正常读成故障」。
   imports: [ConfigModule, StorageModule, QueueModule.register()],
   controllers: [HealthController],
 })
 export class HealthModule {}
