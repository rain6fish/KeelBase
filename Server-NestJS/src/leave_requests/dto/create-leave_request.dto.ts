// SPDX-License-Identifier: Apache-2.0

import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'requestNo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  requestNo!: string;

  @ApiProperty({ description: 'leaveType', enum: ['annual', 'sick', 'personal', 'other'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['annual', 'sick', 'personal', 'other'])
  leaveType!: string;

  @ApiProperty({ description: 'startDate' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: 'endDate' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiProperty({ description: 'days' })
  @IsInt()
  @IsNotEmpty()
  days!: number;

  @ApiPropertyOptional({ description: 'reason' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'status', enum: ['pending', 'approved', 'rejected'] })
  @IsString()
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;
}
