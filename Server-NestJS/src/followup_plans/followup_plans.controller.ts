// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FollowupPlansService } from './followup_plans.service';
import { CreateFollowupPlanDto } from './dto/create-followup_plan.dto';
import { UpdateFollowupPlanDto } from './dto/update-followup_plan.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('跟进计划')
@ApiBearerAuth()
@FeatureFlag('followup_plans')
@Controller({ path: 'followup_plans', version: '1' })
export class FollowupPlansController {
  constructor(private readonly followup_plansService: FollowupPlansService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量跟进计划列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.followup_plansService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意跟进计划' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.followup_plansService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建跟进计划' })
  async create(@Body() dto: CreateFollowupPlanDto, @CurrentUser() user: JwtPayload) {
    return this.followup_plansService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的跟进计划列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.followup_plansService.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新跟进计划' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFollowupPlanDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.followup_plansService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除跟进计划' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.followup_plansService.remove(id, ability);
    return null;
  }
}
