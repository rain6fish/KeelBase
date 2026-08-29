import { Controller, Get, Query } from '@nestjs/common';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { GovernanceApprovalService } from './governance-approval.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';

/**
 * D2-2 独立治理台：治理端点（读侧）——审批列表 / 策略 / 副作用查询。
 * 复用主应用治理 controller 的路由前缀（/ai/*），独立服务注册本 controller。
 */
@Controller({ path: 'ai', version: '1' })
export class GovernanceController {
  constructor(
    private readonly approvals: GovernanceApprovalService,
    private readonly governancePolicy: GovernancePolicyService,
    private readonly toolEffects: AiToolEffectsService,
  ) {}

  @Get('confirmations/pending')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async listPending(@Query('limit') limit?: string) {
    return this.approvals.listPendingApprovals(Math.min(Number(limit) || 50, 100));
  }

  @Get('confirmations/decided')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async listDecided(@Query('limit') limit?: string) {
    return this.approvals.listDecidedApprovals(Math.min(Number(limit) || 50, 100));
  }

  @Get('governance/policy')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async getPolicy() {
    return this.governancePolicy.getPolicy();
  }

  @Get('tool-effects')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async listEffects(
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.toolEffects.list({
      userId: userId != null ? Number(userId) : undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }
}
