// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { CacheModule } from '../common/cache/cache.module';
import { QueueModule } from '../queue/queue.module';
import { OrgModule } from '../org/org.module';
import { WebhookModule } from '../webhooks/webhook.module';

// events 仅用 OrgService.getUserOrgId，非 DI 强依赖。
// 阶段 4 环根治：events→org→flows→ai→events 这条间接环已由两个叶子模块（授权解释面 / 审计写入面）打断，
// 故此处由 forwardRef(OrgModule) 降为普通 import。
@Module({
  imports: [TypeOrmModule.forFeature([Event]), CacheModule, QueueModule.register(), OrgModule, WebhookModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
