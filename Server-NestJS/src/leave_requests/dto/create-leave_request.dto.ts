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

  // `status` is deliberately absent on create: a request that arrives "approved" would be the
  // requester approving themselves. The service writes `pending`; only the update path (admin) may
  // change it. With `forbidNonWhitelisted`, a client that still sends it gets a 400 instead of a
  // silent approval.
  // 创建时**刻意没有** `status`：一条「已批准」的入参会变成申请人自批。服务端写 `pending`；
  // 只有更新路径（管理员）能改。`forbidNonWhitelisted` 下，仍传它的客户端会得到 400，而不是静默批准。
}
