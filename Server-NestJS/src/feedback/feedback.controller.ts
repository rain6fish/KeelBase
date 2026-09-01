// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { FeedbackService } from './feedback.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export class SubmitFeedbackDto {
  @IsIn(['suggestion', 'bug', 'praise'])
  type!: 'suggestion' | 'bug' | 'praise';

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact?: string;
}

@ApiTags('反馈')
@ApiBearerAuth()
@Controller({ path: 'feedback', version: '1' })
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'G-1 应用内反馈：提交建议/问题/好评，通知管理员' })
  async submit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.feedbackService.submit(String(user.sub), dto);
  }
}
