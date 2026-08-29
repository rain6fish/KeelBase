import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Public } from '../auth/guards/public.decorator';
import { GovernanceApiGuard } from './governance-api.guard';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';

/**
 * D2-3 业务系统接入治理台（服务身份）：
 * - POST /external/audit：业务系统上报 AI 审计事件（落治理库审计哈希链）
 * - GET  /external/governance/policy：业务系统拉取实时治理策略
 * 认证：GOVERNANCE_API_KEY（x-api-key / Bearer），服务端到服务端，不经用户 JWT。
 * 副作用/轨迹上报（D2-3 后续）与跨服务确认/撤销（D2-4）按此端点模式扩展。
 */
@Controller({ path: 'external', version: '1' })
@UseGuards(GovernanceApiGuard)
export class ExternalGovernanceController {
  constructor(
    private readonly auditService: AuditService,
    private readonly governancePolicy: GovernancePolicyService,
  ) {}

  /** 业务系统上报 AI 审计事件（userId/action/tool 等），落治理库审计链 */
  @Post('audit')
  @Public()
  async reportAudit(@Body() dto: Record<string, unknown>): Promise<{ ok: boolean }> {
    const action = String(dto.action ?? 'chat') as never;
    const userId = dto.userId != null ? String(dto.userId) : '0';
    await this.auditService.log({
      userId,
      username: dto.username as string | undefined,
      conversationId: dto.conversationId as string | undefined,
      action,
      detail: dto.detail as string | undefined,
      model: dto.model as string | undefined,
      provider: dto.provider as string | undefined,
      agentId: dto.agentId as string | undefined,
      source: (dto.source as string | undefined) ?? 'external',
      promptTokens: dto.promptTokens != null ? Number(dto.promptTokens) : undefined,
      completionTokens: dto.completionTokens != null ? Number(dto.completionTokens) : undefined,
      durationMs: dto.durationMs != null ? Number(dto.durationMs) : undefined,
      isError: Boolean(dto.isError),
      errorMessage: dto.errorMessage as string | undefined,
      authorization: dto.authorization as string | undefined,
    });
    return { ok: true };
  }

  /** 业务系统拉取实时治理策略（工具开关/确认/角色白名单/审计粒度） */
  @Get('governance/policy')
  @Public()
  async getPolicy() {
    return this.governancePolicy.getPolicy();
  }
}
