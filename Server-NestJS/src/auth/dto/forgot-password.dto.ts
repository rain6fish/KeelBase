import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: '注册邮箱', example: 'user@example.com' })
  @IsEmail()
  email!: string;
}
