/**
 * AI 写入操作确认请求 DTO
 */

import { IsEnum } from 'class-validator';

export class ConfirmDecisionDto {
  @IsEnum(['approve', 'reject'])
  decision!: 'approve' | 'reject';
}
