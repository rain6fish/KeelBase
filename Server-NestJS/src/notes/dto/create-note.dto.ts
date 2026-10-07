// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNoteDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'content' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  content!: string;

  @ApiProperty({ description: 'category', enum: ['work', 'personal', 'idea', 'archive'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['work', 'personal', 'idea', 'archive'])
  category!: string;
}
