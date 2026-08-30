import { Controller, Get, Query, Delete, Param, ParseIntPipe, Post, Body, BadRequestException } from '@nestjs/common';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { Public } from '../auth/guards/public.decorator';
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

  /** 治理台健康检查（docker 编排用） */
  @Get('health')
  @Public()
  async health() {
    return { ok: true, service: 'governance' };
  }

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

  /** D2-4 approve 回调执行：治理台裁决审批 → 回调业务系统执行端点（approve 后执行业务工具） */
  @Post('confirmations/:token/approve-by')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async approveBy(
    @Param('token') token: string,
    @Body() dto?: { decision?: 'approve' | 'decline' },
  ): Promise<unknown> {
    const target = process.env.GOVERNANCE_TARGET_URL;
    if (!target) throw new BadRequestException('治理台未配置业务系统回调地址（GOVERNANCE_TARGET_URL）');
    const res = await fetch(`${target}/api/v1/internal/approvals/${encodeURIComponent(token)}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.GOVERNANCE_API_KEY || '',
      },
      body: JSON.stringify({ decision: dto?.decision ?? 'approve', approverId: 'governance' }),
    });
    if (!res.ok) throw new BadRequestException('业务系统审批执行回调失败');
    return await res.json();
  }

  /** D2-4 撤销副作用：优先回调业务系统撤销端点（GOVERNANCE_TARGET_URL）；未配置回退本地 revoker（proxy_call 等） */
  @Delete('tool-effects/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async revokeEffect(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    const target = process.env.GOVERNANCE_TARGET_URL;
    if (target) {
      try {
        const res = await fetch(`${target}/api/v1/internal/effects/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.GOVERNANCE_API_KEY || '',
          },
          body: JSON.stringify({ effectId: id }),
        });
        if (res.ok) return await res.json();
      } catch {
        // 回调失败回退本地 revoker
      }
    }
    return this.toolEffects.revoke(id);
  }
}
