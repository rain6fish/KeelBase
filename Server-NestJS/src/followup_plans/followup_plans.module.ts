// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowupPlansController } from './followup_plans.controller';
import { FollowupPlansService } from './followup_plans.service';
import { FollowupPlan } from './followup_plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FollowupPlan])],
  controllers: [FollowupPlansController],
  providers: [FollowupPlansService],
  exports: [FollowupPlansService],
})
export class FollowupPlansModule {}
