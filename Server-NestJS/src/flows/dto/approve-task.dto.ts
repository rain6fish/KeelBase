// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveTaskDto {
  @ApiProperty({ description: '审批决策', enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional({ description: '审批意见' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
