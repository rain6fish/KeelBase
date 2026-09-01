// SPDX-License-Identifier: Apache-2.0

import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ description: '注册邮箱', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: '6 位验证码', example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
