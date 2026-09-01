// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalRequest } from './approval-request.entity';
import { ApprovalPolicy } from './approval-policy.entity';
import { User } from '../common/entities/user.entity';

/** AI Approval 旗舰应用模块（业务样例，capabilities 可开关） */
@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRequest, ApprovalPolicy, User])],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
