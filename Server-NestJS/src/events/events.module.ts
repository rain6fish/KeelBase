import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { CacheModule } from '../common/cache/cache.module';
import { QueueModule } from '../queue/queue.module';
import { OrgModule } from '../org/org.module';

// forwardRef：events→org→flows→ai→events 间接环（ORG 事件按组织归属），
// events 仅用 OrgService.getUserOrgId，非 DI 强依赖
@Module({
  imports: [TypeOrmModule.forFeature([Event]), CacheModule, QueueModule, forwardRef(() => OrgModule)],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
