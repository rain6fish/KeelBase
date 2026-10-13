// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePointsLedgerDto {
  @ApiProperty({ description: 'points' })
  @IsInt()
  @IsNotEmpty()
  points!: number;

  @ApiProperty({ description: 'checkinDate' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  checkinDate!: string;

  @ApiProperty({ description: 'reason', enum: ['checkin', 'achievement', 'bonus', 'admin_adjust'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['checkin', 'achievement', 'bonus', 'admin_adjust'])
  reason!: string;

  @ApiProperty({ description: 'description' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  description!: string;
}
