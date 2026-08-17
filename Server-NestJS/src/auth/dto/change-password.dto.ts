import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** WEB-FRONT-4 强制改密：登录后修改密码（需当前密码校验）。 */
export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码', example: 'OldPass123' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ description: '新密码（至少 8 位，含字母和数字）', example: 'NewPass123' })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'password must contain letters and numbers',
  })
  newPassword!: string;
}
