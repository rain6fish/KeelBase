// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/guards/public.decorator';
import { GovernanceApiGuard } from '../../governance/governance-api.guard';
import { R4ApprovalService } from '../approvals/r4-approval.service';

/**
 * D2-4 业务系统审批执行回调端点（服务身份）：独立治理台 approve 后回调本系统，
 * 本端点调 R4ApprovalService.decideApproval（approve → 以 operator 维度执行业务工具，幂等 + 副作用登记 + 审计）。
 * 认证：GOVERNANCE_API_KEY（与治理台共享）。
 */
@Controller({ path: 'internal/approvals', version: '1' })
@UseGuards(GovernanceApiGuard)
export class InternalApprovalsController {
  constructor(private readonly r4Approval: R4ApprovalService) {}

  /** 治理台回调：对审批请求执行决策（approve → 执行业务工具 / decline → 拒绝） */
  @Post(':token/execute')
  @Public()
  async execute(
    @Param('token') token: string,
    @Body() dto?: { approverId?: string; decision?: 'approve' | 'decline' },
  ) {
    return this.r4Approval.decideApproval(
      token,
      dto?.approverId ?? 'governance',
      dto?.decision ?? 'approve',
    );
  }
}
