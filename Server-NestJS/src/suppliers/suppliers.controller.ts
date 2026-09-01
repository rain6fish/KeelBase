// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('供应商')
@ApiBearerAuth()
@FeatureFlag('suppliers')
@Controller({ path: 'suppliers', version: '1' })
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量供应商列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.suppliersService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意供应商' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.suppliersService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建供应商' })
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: JwtPayload) {
    return this.suppliersService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的供应商列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.suppliersService.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新供应商' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.suppliersService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除供应商' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.suppliersService.remove(id, ability);
    return null;
  }
}
