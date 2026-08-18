import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../common/entities/user.entity';
import { CrmCustomer } from '../crm/crm-customer.entity';
import { CrmOrder } from '../crm/crm-order.entity';
import { CrmTask } from '../crm/crm-task.entity';
import { CrmRisk } from '../crm/crm-risk.entity';
import { PmProject } from '../pm/pm-project.entity';
import { PmTask } from '../pm/pm-task.entity';
import { PmRisk } from '../pm/pm-risk.entity';
import { ApprovalRequest } from '../approval/approval-request.entity';
import { ApprovalPolicy } from '../approval/approval-policy.entity';
import { EventsModule } from '../events/events.module';
import { TodosModule } from '../todos/todos.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CrmCustomer, CrmOrder, CrmTask, CrmRisk, PmProject, PmTask, PmRisk, ApprovalRequest, ApprovalPolicy]),
    EventsModule,
    TodosModule,
    NotificationsModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
