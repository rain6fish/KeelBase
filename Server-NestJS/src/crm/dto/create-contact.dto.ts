// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Customer 360：联系人（Create / Update 共用） */
export class CreateContactDto {
  @ApiProperty({ description: '联系人姓名' })
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '电话' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: '角色（决策人/采购/财务/技术）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  role?: string;

  @ApiPropertyOptional({ description: '部门' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string;

  @ApiPropertyOptional({ description: '是否主联系人' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
