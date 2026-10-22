// SPDX-License-Identifier: Apache-2.0

import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsIn } from 'class-validator';
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
   * Upper bound of the window. The coverage statement (`AW-3`) needs a closed period; the log list is
   * always "from here onwards" and ignores it.
   *
   * 时间窗的上界。覆盖声明（`AW-3`）要一个**闭合**的期间；日志列表始终是「从此刻往前」，忽略它。
   */
  @ApiPropertyOptional({ description: '结束时间（ISO 8601）—— 覆盖声明（AW-3）用；日志列表忽略它' })
  @IsOptional()
  @IsDateString()
  until?: string;
}
