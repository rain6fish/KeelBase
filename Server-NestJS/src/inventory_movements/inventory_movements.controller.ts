// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryMovementsService } from './inventory_movements.service';
import { CreateInventoryMovementDto } from './dto/create-inventory_movement.dto';
import { UpdateInventoryMovementDto } from './dto/update-inventory_movement.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('库存出入库')
@ApiBearerAuth()
@FeatureFlag('inventory_movements')
@Controller({ path: 'inventory_movements', version: '1' })
export class InventoryMovementsController {
  constructor(private readonly inventory_movementsService: InventoryMovementsService) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量库存出入库列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.inventory_movementsService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意库存出入库' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.inventory_movementsService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建库存出入库' })
  async create(@Body() dto: CreateInventoryMovementDto, @CurrentUser() user: JwtPayload) {
    return this.inventory_movementsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的库存出入库列表' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.inventory_movementsService.findAll(user.sub, q);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新库存出入库' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryMovementDto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.inventory_movementsService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除库存出入库' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.inventory_movementsService.remove(id, ability);
    return null;
  }
}
