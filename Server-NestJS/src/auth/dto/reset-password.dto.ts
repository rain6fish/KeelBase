// SPDX-License-Identifier: Apache-2.0

import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: '重置令牌（邮件链接中的 token）', example: 'c4a8...' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: '新密码（至少 8 位，含字母和数字）', example: 'NewPass123' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'password must contain letters and numbers',
  })
  newPassword!: string;
}
