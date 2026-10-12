// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PointRecordsService } from './point_records.service';
import { CreatePointRecordDto } from './dto/create-point_record.dto';
import { UpdatePointRecordDto } from './dto/update-point_record.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('积分流水')
@ApiBearerAuth()
@FeatureFlag('point_records')
@Controller({ path: 'point_records', version: '1' })
export class PointRecordsController {
  constructor(private readonly point_recordsService: PointRecordsService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量积分流水列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.point_recordsService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意积分流水' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.point_recordsService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建积分流水' })
  async create(@Body() dto: CreatePointRecordDto, @CurrentUser() user: JwtPayload) {
    return this.point_recordsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的积分流水列表' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.point_recordsService.findAll(user.sub, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新积分流水' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePointRecordDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.point_recordsService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除积分流水' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.point_recordsService.remove(id, ability);
    return null;
  }
}
