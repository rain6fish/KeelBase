// SPDX-License-Identifier: Apache-2.0

import {
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: '用户名', example: 'john_doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '用户名只能包含字母、数字和下划线',
  })
  username!: string;

  @ApiProperty({ description: '邮箱', example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: '密码（至少8位，需包含字母和数字）', example: 'MyPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: '密码必须包含字母和数字',
  })
  password!: string;

  @ApiPropertyOptional({ description: '名', example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @ApiPropertyOptional({ description: '姓', example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  @ApiProperty({ description: '昵称', example: 'Johnny' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname!: string;

  @ApiPropertyOptional({ description: '生日 (YYYY-MM-DD)', example: '1994-05-20' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: '手机号', example: '+8613800138000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '邀请码（G-2）', example: 'ABCDEF12' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  inviteCode?: string;
}
