import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeactivateAccountDto {
  @ApiProperty({ description: '当前密码（确认注销）' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
