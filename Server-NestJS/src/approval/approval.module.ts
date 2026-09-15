// SPDX-License-Identifier: Apache-2.0

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalRequest } from './approval-request.entity';
import { ApprovalPolicy } from './approval-policy.entity';
import { User } from '../common/entities/user.entity';
import { OrgModule } from '../org/org.module';

/** AI Approval 旗舰应用模块（业务样例，capabilities 可开关） */
@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRequest, ApprovalPolicy, User]), forwardRef(() => OrgModule)], // org→flows→ai→auth 间接环：须 forwardRef
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
