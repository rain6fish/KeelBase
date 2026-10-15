// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssetLoansService } from './asset_loans.service';
import { CreateAssetLoanDto } from './dto/create-asset_loan.dto';
import { UpdateAssetLoanDto } from './dto/update-asset_loan.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('资产借用')
@ApiBearerAuth()
@FeatureFlag('asset_loans')
@Controller({ path: 'asset_loans', version: '1' })
export class AssetLoansController {
  constructor(private readonly asset_loansService: AssetLoansService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量资产借用列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.asset_loansService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意资产借用' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.asset_loansService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建资产借用' })
  async create(@Body() dto: CreateAssetLoanDto, @CurrentUser() user: JwtPayload) {
    return this.asset_loansService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的资产借用列表' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.asset_loansService.findAll(user.sub, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新资产借用' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetLoanDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.asset_loansService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除资产借用' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.asset_loansService.remove(id, ability);
    return null;
  }
}
