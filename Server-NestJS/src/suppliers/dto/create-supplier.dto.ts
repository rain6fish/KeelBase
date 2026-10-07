// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ description: 'name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'contact' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  contact!: string;

  @ApiProperty({ description: 'status', enum: ['active', 'inactive', 'blacklist'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['active', 'inactive', 'blacklist'])
  status!: string;

  @ApiProperty({ description: 'riskLevel', enum: ['low', 'medium', 'high'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['low', 'medium', 'high'])
  riskLevel!: string;

  @ApiPropertyOptional({ description: 'annualSpend' })
  @IsInt()
  @IsOptional()
  annualSpend?: number;
}
