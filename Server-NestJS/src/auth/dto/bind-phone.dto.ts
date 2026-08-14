import { IsString, IsNotEmpty, MaxLength, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BindPhoneDto {
  @ApiProperty({ description: '手机号', example: '+8613800138000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+?\d{6,15}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ description: '短信验证码', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: '验证码为 6 位数字' })
  code!: string;
}
