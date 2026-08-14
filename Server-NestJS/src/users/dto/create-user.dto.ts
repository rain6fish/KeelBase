import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: '用户名', example: 'john_doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '用户名只能包含字母、数字和下划线',
  })
  username!: string;

  @ApiProperty({ description: '邮箱', example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: '密码（至少8位，需包含字母和数字）', example: 'MyPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: '密码必须包含字母和数字',
  })
  password!: string;

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

  @ApiProperty({ description: '昵称', example: 'Johnny' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname!: string;
}
