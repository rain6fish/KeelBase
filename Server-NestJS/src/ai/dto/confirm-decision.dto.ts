// SPDX-License-Identifier: Apache-2.0

/**
 * AI 写入操作确认请求 DTO
 */

import { IsEnum, IsOptional, IsBoolean } from 'class-validator';

export class ConfirmDecisionDto {
  /**
   * 规范决策词：approve | decline（与 outcome/trace/audit/R4/DB 统一，CE-1 B3b）。
   * `reject` 为 v1 遗留别名，服务端接受并按 decline 归一（deprecated，见 specs/protocol/schemas/v2）。
   */
  @IsEnum(['approve', 'decline', 'reject'])
  decision!: 'approve' | 'decline' | 'reject';

  /** HS-6：本次会话信任该工具（后续免确认） */
  @IsOptional()
  @IsBoolean()
  trustTool?: boolean;
}
