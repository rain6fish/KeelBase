// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REQUEST_TYPES } from '../approval-request.entity';

export class CreateRequestDto {
  @ApiProperty({ description: '标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '类型', enum: REQUEST_TYPES })
  @IsOptional()
  @IsIn([...REQUEST_TYPES, 'general'])
  type?: string;

  @ApiProperty({ description: '金额' })
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  amount!: number;

  @ApiProperty({ description: '事由' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreatePolicyDto {
  @ApiProperty({ description: '政策标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '适用类型' })
  @IsOptional()
  @IsIn([...REQUEST_TYPES, 'general'])
  type?: string;

  @ApiProperty({ description: '自动通过金额阈值' })
  @IsNumber()
  @Min(0)
  maxAmount!: number;

  @ApiPropertyOptional({ description: '政策说明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class DecideDto {
  @ApiProperty({ description: '决定', enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';
}
