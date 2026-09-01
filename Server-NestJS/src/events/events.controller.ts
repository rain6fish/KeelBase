// SPDX-License-Identifier: Apache-2.0

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('事件')
@ApiBearerAuth()
@Controller({ path: 'events', version: '1' })
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建事件' })
  @ApiCreatedResponse({ description: '创建成功' })
  async create(@Body() dto: CreateEventDto, @CurrentUser() user: JwtPayload) {
    return this.eventsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取日期范围内的事件' })
  @ApiQuery({ name: 'start', required: true, example: '2026-01-01' })
  @ApiQuery({ name: 'end', required: true, example: '2026-01-31' })
  async getEvents(
    @Query('start') start: string,
    @Query('end') end: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.getEventsForRange(start, end, user.sub);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索事件（支持关键词、时间范围、分页）' })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索关键词（标题/描述）' })
  @ApiQuery({ name: 'start', required: false, description: '开始日期' })
  @ApiQuery({ name: 'end', required: false, description: '结束日期' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '20' })
  async search(
    @Query('keyword') keyword?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.eventsService.search({ keyword, start, end, page: page!, limit: limit! }, user?.sub);
  }

  @Get('admin/all')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '全量事件列表（管理员）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'keyword', required: false, description: '标题搜索' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤' })
  @ApiQuery({ name: 'isCancelled', required: false, description: '按状态过滤' })
  @ApiQuery({ name: 'start', required: false, description: '开始时间（ISO）' })
  @ApiQuery({ name: 'end', required: false, description: '结束时间（ISO）' })
  async adminFindAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('userId', new DefaultValuePipe(undefined)) userIdRaw?: string,
    @Query('isCancelled', new DefaultValuePipe(undefined)) cancelledRaw?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.eventsService.findAll(page, limit, {
      keyword,
      userId: userIdRaw ? Number(userIdRaw) : undefined,
      isCancelled: cancelledRaw === 'true' ? true : cancelledRaw === 'false' ? false : undefined,
      start,
      end,
    });
  }

  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '删除任意事件（管理员）' })
  async adminRemove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.eventsService.remove(id, ability);
    return null;
  }

  @Get(':id')
  @ApiOperation({ summary: '获取事件详情' })
  @ApiOkResponse({ description: '查询成功' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.eventsService.findOne(id, ability);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新事件' })
  @ApiOkResponse({ description: '更新成功' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.eventsService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除事件' })
  @ApiOkResponse({ description: '删除成功' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.eventsService.remove(id, ability);
    return null;
  }
}
