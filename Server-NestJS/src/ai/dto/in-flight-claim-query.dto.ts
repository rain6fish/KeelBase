// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * AW-16: filters for the in-flight claim read. Every field only **narrows** the list — the row scope
 * comes from the caller's account, not from the request.
 *
 * AW-16：在途占位查询的过滤条件。每个字段都只**收紧**清单 —— 行范围来自调用者的账号，而不是请求。
 */
export class InFlightClaimQueryDto {
  @ApiPropertyOptional({ description: '按占位用户过滤（`ai_write_claims.user_id`）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ description: '按工具名过滤' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  toolName?: string;

  @ApiPropertyOptional({ description: '起始时间（ISO 8601，含端点）' })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601，含端点）' })
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiPropertyOptional({
    description: 'true = 只看已过陈旧阈值的行（其余 `claimed` 行照常返回并带 `stale:false`）',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  stale?: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      'AW-16 F-64：治理处置过滤。默认在途（open + awaiting_decision）；open=仅窗口内；' +
      'awaiting_decision=待裁队列；closed_unknown=已释放（结论未知）；all=含已关闭的历史',
    enum: ['in_flight', 'open', 'awaiting_decision', 'closed_unknown', 'all'],
  })
  @IsOptional()
  @IsIn(['in_flight', 'open', 'awaiting_decision', 'closed_unknown', 'all'])
  decisionState?: 'in_flight' | 'open' | 'awaiting_decision' | 'closed_unknown' | 'all';

  @ApiPropertyOptional({ description: '返回条数上限', default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
