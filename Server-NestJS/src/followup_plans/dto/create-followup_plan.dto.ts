// SPDX-License-Identifier: Apache-2.0

import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFollowupPlanDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'customerId' })
  @IsInt()
  @IsOptional()
  customerId?: number;

  @ApiProperty({ description: 'priority', enum: ['low', 'medium', 'high', 'critical'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority!: string;

  @ApiPropertyOptional({ description: 'reason' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'dueDate' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ description: 'status', enum: ['planned', 'done', 'cancelled'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['planned', 'done', 'cancelled'])
  status!: string;
}
