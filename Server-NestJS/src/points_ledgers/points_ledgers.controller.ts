// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PointsLedgersService } from './points_ledgers.service';
import { CreatePointsLedgerDto } from './dto/create-points_ledger.dto';
import { UpdatePointsLedgerDto } from './dto/update-points_ledger.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('积分台账')
@ApiBearerAuth()
@FeatureFlag('points_ledgers')
@Controller({ path: 'points_ledgers', version: '1' })
export class PointsLedgersController {
  constructor(private readonly points_ledgersService: PointsLedgersService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量积分台账列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.points_ledgersService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意积分台账' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.points_ledgersService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建积分台账' })
  async create(@Body() dto: CreatePointsLedgerDto, @CurrentUser() user: JwtPayload) {
    return this.points_ledgersService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的积分台账列表' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.points_ledgersService.findAll(user.sub, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新积分台账' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePointsLedgerDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.points_ledgersService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除积分台账' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.points_ledgersService.remove(id, ability);
    return null;
  }
}
