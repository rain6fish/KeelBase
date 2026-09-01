// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsUrl, IsBoolean } from 'class-validator';
import { WebhookService } from './webhook.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

class SubscribeWebhookDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsArray()
  events!: string[];
}

class UpdateWebhookDto {
  @IsBoolean()
  enabled!: boolean;
}

/** PL-14 Webhook 订阅管理（本人）：为平台事件注册回调 URL，投递 HMAC 签名。 */
@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller({ path: 'webhooks', version: '1' })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'PL-14 订阅 Webhook（本人）' })
  subscribe(@CurrentUser() user: JwtPayload, @Body() dto: SubscribeWebhookDto) {
    return this.webhookService.subscribe(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: '我的 Webhook 订阅列表（本人）' })
  list(@CurrentUser() user: JwtPayload) {
    return this.webhookService.list(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '启用/停用 Webhook（本人）' })
  async setEnabled(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhookService.setEnabled(user.sub, id, dto.enabled);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除 Webhook（本人）' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.webhookService.remove(user.sub, id);
  }

  @Post('test/:id')
  @ApiOperation({ summary: '测试投递（向指定 Webhook 发测试 payload，本人）' })
  test(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.webhookService.testDeliver(user.sub, id);
  }
}
