/**
 * AI 写入操作确认请求 DTO
 */

import { IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class ConfirmDecisionDto {
  @IsEnum(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  /** HS-6：本次会话信任该工具（后续免确认） */
  @IsOptional()
  @IsBoolean()
  trustTool?: boolean;
}
