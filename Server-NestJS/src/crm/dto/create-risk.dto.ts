// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RISK_LEVELS } from '../crm-customer.entity';

export class CreateRiskDto {
  @ApiPropertyOptional({ description: '风险等级', enum: RISK_LEVELS })
  @IsOptional()
  @IsIn(RISK_LEVELS)
  level?: string;

  @ApiProperty({ description: '风险原因' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: '发现时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  detectedAt?: string;

  @ApiPropertyOptional({ description: '解决时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  resolvedAt?: string;
}
