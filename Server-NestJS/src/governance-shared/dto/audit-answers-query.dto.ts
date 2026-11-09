// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, IsInt, Min, Max, IsDateString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * The export's own page size, separate from the list's: a list page is read on screen and 200 is
 * generous, while an export is read in a spreadsheet and 200 is a fragment. The cap still exists —
 * an unbounded export is a way to pull the whole table through one request.
 *
 * 导出自己的页大小，与列表分开：列表在屏幕上读，200 已经很宽；导出在表格里读，200 只是一小段。
 * 上限仍然保留 —— 无上限的导出就是一次请求把整张表拉走的办法。
 */
export class AuditAnswersQueryDto {
  @ApiPropertyOptional({ description: '业务对象类型（与 objectId 成对；见 GET /audit/object-types）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  objectType?: string;

  @ApiPropertyOptional({ description: '业务对象 id（与 objectType 成对）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  objectId?: number;

  @ApiPropertyOptional({ description: '起始时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiPropertyOptional({ description: '最多导出的记录数', default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 500;
}
