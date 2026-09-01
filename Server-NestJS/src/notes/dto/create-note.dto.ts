// SPDX-License-Identifier: Apache-2.0

import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNoteDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'content' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: 'category', enum: ['work', 'personal', 'idea', 'archive'] })
  @IsString()
  @IsIn(['work', 'personal', 'idea', 'archive'])
  category!: string;
}
