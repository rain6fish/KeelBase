// SPDX-License-Identifier: Apache-2.0

import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssetLoanDto {
  @ApiProperty({ description: 'assetName' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  assetName!: string;

  @ApiProperty({ description: 'assetTag' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  assetTag!: string;

  @ApiPropertyOptional({ description: 'purpose' })
  @IsString()
  @IsOptional()
  purpose?: string;

  @ApiPropertyOptional({ description: 'dueDate' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ description: 'status', enum: ['active', 'returned', 'overdue'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['active', 'returned', 'overdue'])
  status!: string;
}
