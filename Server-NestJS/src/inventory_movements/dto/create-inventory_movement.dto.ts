// SPDX-License-Identifier: Apache-2.0

import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInventoryMovementDto {
  @ApiProperty({ description: 'documentNo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  documentNo!: string;

  @ApiProperty({ description: 'sku' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  sku!: string;

  @ApiProperty({ description: 'itemName' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  itemName!: string;

  @ApiProperty({ description: 'direction', enum: ['in', 'out'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['in', 'out'])
  direction!: string;

  @ApiProperty({ description: 'quantity' })
  @IsInt()
  @IsNotEmpty()
  quantity!: number;

  @ApiPropertyOptional({ description: 'unit' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  unit?: string;

  @ApiPropertyOptional({ description: 'partner' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  partner?: string;

  @ApiPropertyOptional({ description: 'occurredAt' })
  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'note' })
  @IsString()
  @IsOptional()
  note?: string;
}
