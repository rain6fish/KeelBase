// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OPPORTUNITY_STAGES } from '../crm-opportunity.entity';

/** Customer 360：销售机会（Create / Update 共用 PartialType 语义） */
export class CreateOpportunityDto {
  @ApiProperty({ description: '机会名称（如"Q3 续约扩展"）' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: '机会金额' })
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  amount!: number;

  @ApiPropertyOptional({ description: '阶段（销售漏斗）', enum: OPPORTUNITY_STAGES })
  @IsOptional()
  @IsIn(OPPORTUNITY_STAGES)
  stage?: string;

  @ApiPropertyOptional({ description: '成交概率 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @ApiPropertyOptional({ description: '预期成交日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}
