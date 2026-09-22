// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { OrgDirectoryService } from './org-directory.service';
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

// （阶段 4 环根治：flows 改为只引审计写入面叶子模块，org→flows 不再回环，普通 import 即可）
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Department, OrgMember, OrgInvite, User, FlowInstance, FlowTask]),
    NotificationsModule,
    FlowsModule,
  ],
  controllers: [OrgController],
  // DataScopeService 挂在这里而非新开 AuthzModule：它只需要 User 仓储（本模块已有）+ OrgService
  // + 全局 CaslModule 的 RoleRuleSource，且这样 Todos/Events 无需改模块接线、不引入新的循环依赖。
  providers: [OrgService, OrgDirectoryService, DataScopeService],
  exports: [OrgService, OrgDirectoryService, DataScopeService],
})
export class OrgModule {}
