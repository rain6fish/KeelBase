import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendSmsCodeDto {
  @ApiProperty({ description: '手机号', example: '+8613800138000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+?\d{6,15}$/, { message: '手机号格式不正确' })
  phone!: string;
}
