import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from '../auth/user-session.entity';
import { PhoneVerificationCode } from '../auth/phone-verification-code.entity';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaintenanceTasksService } from './maintenance-tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSession,
      PhoneVerificationCode,
      User,
      Event,
      Todo,
      Notification,
    ]),
    NotificationsModule,
  ],
  providers: [MaintenanceTasksService],
})
export class MaintenanceTasksModule {}
