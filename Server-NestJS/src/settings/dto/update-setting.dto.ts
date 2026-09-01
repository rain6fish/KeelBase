// SPDX-License-Identifier: Apache-2.0

import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateSettingDto {
  @IsString()
  value!: string;

  @IsOptional()
  @IsIn(['string', 'number', 'boolean'])
  type?: 'string' | 'number' | 'boolean';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
