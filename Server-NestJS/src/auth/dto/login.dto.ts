// SPDX-License-Identifier: Apache-2.0

import { IsString, MinLength, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: '密码', example: 'MyPass123' })
  @IsString()
  @MinLength(1)
  password!: string;

  /** Set by the controller from the X-Device-Id header — not from the body. */
  @IsString()
  @IsOptional()
  deviceId!: string;

  /** 设备名（前端可传，如 "Chrome / Windows"），用于会话列表展示。 */
  @ApiProperty({ description: '设备名称', example: 'Chrome on Windows', required: false })
  @IsString()
  @IsOptional()
  deviceName?: string;

  /** WEB-FRONT-4 MFA：启用双因素的用户登录时需传 6 位 TOTP code。 */
  @ApiProperty({ description: 'TOTP 两步验证码（启用 MFA 的用户必填）', example: '123456', required: false })
  @IsString()
  @IsOptional()
  totp?: string;
}
