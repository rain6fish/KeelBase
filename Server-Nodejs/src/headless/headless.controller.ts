import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { AiService } from '../ai/ai.service';
import { Public } from '../auth/guards/public.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import { HeadlessGuard } from './headless.guard';

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

/**
 * AI-19 Agent 对外 API（headless）：第三方应用通过 API Key 调用本基座 Agent。
 * 复用 AiService.chat（含工具/记忆/审计），以系统用户身份执行。
 */
@ApiTags('Headless API')
@ApiHeader({ name: 'x-api-key', required: true, description: 'HEADLESS_API_KEY' })
@Controller({ path: 'headless', version: '1' })
export class HeadlessController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @Public()
  @UseGuards(HeadlessGuard)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-19 无头对话（API Key 认证，第三方集成）' })
  async chat(@Body() dto: HeadlessChatDto) {
    const result = await this.aiService.chat('0', {
      message: dto.message,
      provider: dto.provider,
      model: dto.model,
    });
    return { reply: result.reply, conversationId: result.conversationId };
  }
}
