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
}
