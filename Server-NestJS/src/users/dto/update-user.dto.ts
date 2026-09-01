// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, IsEmail, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '邮箱', example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

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

  @ApiPropertyOptional({ description: '昵称', example: '更新后的昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiPropertyOptional({ description: '生日 (YYYY-MM-DD)', example: '1994-05-20' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: '手机号', example: '+8613800138000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '个人简介', example: '全栈开发者，热爱开源' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  bio?: string;

  @ApiPropertyOptional({ description: '头像 URL', example: 'https://...' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  avatarUrl?: string;

  @ApiPropertyOptional({ description: '密码（至少8位，需包含字母和数字）', example: 'newpassword123' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, { message: '密码必须包含字母和数字' })
  password?: string;
}
