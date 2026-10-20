// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequestsController } from './leave_requests.controller';
import { LeaveRequestsService } from './leave_requests.service';
import { LeaveRequest } from './leave_request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest])],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
