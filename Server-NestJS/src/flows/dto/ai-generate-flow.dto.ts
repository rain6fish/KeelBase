// SPDX-License-Identifier: Apache-2.0

import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AiGenerateFlowDto {
  @ApiProperty({ description: '自然语言流程需求', example: '请假审批：超过3天需经理审批，否则直属审批' })
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  description!: string;
}
