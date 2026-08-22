/**
 * R4 双人审批决策 DTO（approver 对 pending 审批请求 approve/decline）
 */

import { IsEnum } from 'class-validator';

export class ApproveDecisionDto {
  @IsEnum(['approve', 'decline'])
  decision!: 'approve' | 'decline';
}
