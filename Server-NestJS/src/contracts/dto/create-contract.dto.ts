// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ description: 'name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'counterparty' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  counterparty!: string;

  @ApiProperty({ description: 'status', enum: ['draft', 'reviewing', 'active', 'expired', 'terminated'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['draft', 'reviewing', 'active', 'expired', 'terminated'])
  status!: string;

  @ApiPropertyOptional({ description: 'amount' })
  @IsInt()
  @IsOptional()
  amount?: number;
}
