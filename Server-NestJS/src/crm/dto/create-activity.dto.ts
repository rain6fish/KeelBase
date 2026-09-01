// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ACTIVITY_TYPES } from '../crm-activity.entity';

export class CreateActivityDto {
  @ApiPropertyOptional({ description: '跟进类型', enum: ACTIVITY_TYPES })
  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  type?: string;

  @ApiProperty({ description: '跟进内容' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional({ description: '发生时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  happenedAt?: string;
}
