import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgInvite } from './org-invite.entity';
import { User } from '../common/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlowsModule } from '../flows/flows.module';
import { FlowInstance } from '../flows/entities/flow-instance.entity';

// forwardRef：org→flows→ai→events→org 间接环（ORG 事件按组织归属引入 events→org）
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Department, OrgMember, OrgInvite, User, FlowInstance]),
    NotificationsModule,
    forwardRef(() => FlowsModule),
  ],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
