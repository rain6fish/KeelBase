// SPDX-License-Identifier: Apache-2.0

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { DataScopeService } from '../authz/data-scope.service';
import { Organization } from './organization.entity';
import { Department } from './department.entity';
import { OrgMember } from './org-member.entity';
import { OrgInvite } from './org-invite.entity';
import { User } from '../common/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlowsModule } from '../flows/flows.module';
import { FlowInstance } from '../flows/entities/flow-instance.entity';
import { FlowTask } from '../flows/entities/flow-task.entity';

// forwardRef：org→flows→ai→events→org 间接环（ORG 事件按组织归属引入 events→org）
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Department, OrgMember, OrgInvite, User, FlowInstance, FlowTask]),
    NotificationsModule,
    forwardRef(() => FlowsModule),
  ],
  controllers: [OrgController],
  // DataScopeService 挂在这里而非新开 AuthzModule：它只需要 User 仓储（本模块已有）+ OrgService
  // + 全局 CaslModule 的 RoleRuleSource，且这样 Todos/Events 无需改模块接线、不引入新的循环依赖。
  providers: [OrgService, DataScopeService],
  exports: [OrgService, DataScopeService],
})
export class OrgModule {}
