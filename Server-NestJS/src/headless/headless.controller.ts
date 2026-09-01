// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AiService } from '../ai/ai.service';
import { actorContext } from '../ai/actor-context';
import { Public } from '../auth/guards/public.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import { HeadlessGuard } from './headless.guard';
import type { HeadlessKeyContext } from './headless-keys.service';

export class HeadlessChatDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

interface HeadlessRequest extends Request {
  headlessKey?: HeadlessKeyContext;
}

/**
 * HS-4 Agent 对外 API（headless）：第三方应用通过 API Key 调用本基座 Agent。
 * 以该 key 归属用户身份执行（配额/审计/记忆归属独立），替代固定系统账号 '0'。
 */
@ApiTags('Headless API')
@ApiHeader({ name: 'x-api-key', required: true, description: 'API Key（管理台创建或 HEADLESS_API_KEY）' })
@Controller({ path: 'headless', version: '1' })
export class HeadlessController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @Public()
  @UseGuards(HeadlessGuard)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HS-4 无头对话（API Key 认证，按 key 归属用户身份执行）' })
  async chat(@Body() dto: HeadlessChatDto, @Req() req: HeadlessRequest) {
    const ctx = req.headlessKey!;
    // Agent Identity（评审二 §5）：headless 集成以 key 名作 agentId，审计可溯源「哪个集成/代理身份执行」
    const result = await actorContext.run({ agentId: ctx.name }, () =>
      this.aiService.chat(String(ctx.ownerUserId), {
        message: dto.message,
        provider: dto.provider,
        model: dto.model,
      }),
    );
    return { reply: result.reply, conversationId: result.conversationId };
  }
}
