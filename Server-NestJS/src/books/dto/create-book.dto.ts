// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'author' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  author!: string;

  @ApiProperty({ description: 'status', enum: ['unread', 'reading', 'finished'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['unread', 'reading', 'finished'])
  status!: string;

  @ApiPropertyOptional({ description: 'rating' })
  @IsInt()
  @IsOptional()
  rating?: number;
}
