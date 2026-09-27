// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'summary' })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiProperty({ description: 'status', enum: ['draft', 'published'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['draft', 'published'])
  status!: string;

  @ApiPropertyOptional({ description: 'amount' })
  @IsInt()
  @IsOptional()
  amount?: number;
}
