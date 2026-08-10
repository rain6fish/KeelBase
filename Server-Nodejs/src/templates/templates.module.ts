import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../common/entities/user.entity';
import { EventsModule } from '../events/events.module';
import { TodosModule } from '../todos/todos.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), EventsModule, TodosModule, NotificationsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
