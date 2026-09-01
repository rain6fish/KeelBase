// SPDX-License-Identifier: Apache-2.0

import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('通知')
@ApiBearerAuth()
@FeatureFlag('notifications')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取当前用户通知列表（分页）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAll(user.sub, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.notificationsService.unreadCount(user.sub) };
  }

  @Patch('read-all')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '全部标记已读' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.notificationsService.markAllRead(user.sub);
    return null;
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '通知实时推送（SSE，长连接）' })
  async stream(
    @CurrentUser() user: JwtPayload,
    @Res() response: Response,
  ) {
    // SSE 头部（复用 AI 流式模式）
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    this.notificationsGateway.subscribe(user.sub, response);

    // 连接保持，客户端断开时 gateway 自动清理
  }

  @Patch(':id/read')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记单条通知已读' })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.notificationsService.markRead(id, user.sub);
    return null;
  }

  @Delete(':id')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除通知' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.notificationsService.remove(id, user.sub);
    return null;
  }
}
