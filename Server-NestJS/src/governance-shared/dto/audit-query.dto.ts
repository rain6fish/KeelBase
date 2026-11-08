// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AuditQueryDto {
  @ApiPropertyOptional({ description: '按用户 ID 过滤' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '按是否错误过滤（E-2 异常视图：true 仅错误日志）' })
  @IsOptional()
  @IsIn(['true', 'false'])
  isError?: 'true' | 'false';

  @ApiPropertyOptional({ description: '仅越权/阻断事件（A-8：isError + authorization 非空）' })
  @IsOptional()
  @IsIn(['true'])
  denied?: 'true';

  @ApiPropertyOptional({ description: '按 Agent 过滤（D4 agent_id，Agent Registry → 审计联动）' })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({ description: '按组织 ID 过滤（ORG-5 组织维度审计）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  orgId?: number;

  @ApiPropertyOptional({ description: '返回条数上限', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: '跳过条数', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ description: '起始时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  since?: string;

  /**
   * Upper bound of the window, closed on both ends. Both the coverage statement (`AW-3`) and the
   * log list use it; the list used to ignore it, so a caller asking for a period got an open-ended
   * read — the defect the audit window search depends on being fixed.
   *
   * 时间窗的上界，两端闭合。覆盖声明（`AW-3`）与日志列表都用它；列表曾忽略它，于是要求一段期间的
   * 调用者实际拿到的是无界读取 —— 按区间检索的审计读面依赖这处已修好的缺陷。
   */
  @ApiPropertyOptional({ description: '结束时间（ISO 8601）—— 与 since 一起构成闭合期间（列表与覆盖声明都用）' })
  @IsOptional()
  @IsDateString()
  until?: string;

  /**
   * Business object, by its `result_type` token. Must be given together with `objectId`: half a
   * filter would silently mean "every row", which reads as a match rather than a mistake.
   *
   * 业务对象，按 `result_type` 令牌。必须与 `objectId` 成对给出：半个过滤条件会悄悄等于「全部行」，
   * 那会被读成一次命中，而不是一次输入错误。
   */
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
}
