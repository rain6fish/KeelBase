// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaveRequestsService } from './leave_requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave_request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave_request.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('请假申请')
@ApiBearerAuth()
@FeatureFlag('leave_requests')
@Controller({ path: 'leave_requests', version: '1' })
export class LeaveRequestsController {
  constructor(private readonly leave_requestsService: LeaveRequestsService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量请假申请列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.leave_requestsService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意请假申请' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.leave_requestsService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建请假申请' })
  async create(@Body() dto: CreateLeaveRequestDto, @CurrentUser() user: JwtPayload) {
    return this.leave_requestsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的请假申请列表' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.leave_requestsService.findAll(user.sub, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新请假申请' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveRequestDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.leave_requestsService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除请假申请' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.leave_requestsService.remove(id, ability);
    return null;
  }
}
