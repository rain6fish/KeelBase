// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { InsightsService } from './insights.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SkipAudit } from '../../operation-audit/skip-audit.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

class InsightsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}

@ApiTags('AI')
@ApiBearerAuth()
@Controller({ path: 'ai/insights', version: '1' })
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post()
  @SkipAudit()
  @ApiOperation({ summary: '生成用户数据洞察报告' })
  async generateInsights(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InsightsDto,
  ) {
    return this.insightsService.generateInsights(user.sub, dto.days);
  }
}
