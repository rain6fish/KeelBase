import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Public } from '../auth/guards/public.decorator';
import { GovernanceApiGuard } from './governance-api.guard';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { SidecarRegistryService } from './sidecar-registry.service';

/**
 * D2-3 业务系统接入治理台（服务身份）：
 * - POST /external/audit：业务系统上报 AI 审计事件（落治理库审计哈希链）
 * - GET  /external/governance/policy：业务系统拉取实时治理策略
 * - POST /external/governance/sidecars/register：sidecar 注册回调（B2 策略实时推送）
 * 认证：GOVERNANCE_API_KEY（x-api-key / Bearer），服务端到服务端，不经用户 JWT。
 * 副作用/轨迹上报（D2-3 后续）与跨服务确认/撤销（D2-4）按此端点模式扩展。
 */
@Controller({ path: 'external', version: '1' })
@UseGuards(GovernanceApiGuard)
export class ExternalGovernanceController {
  constructor(
    private readonly auditService: AuditService,
    private readonly governancePolicy: GovernancePolicyService,
    private readonly toolEffects: AiToolEffectsService,
    private readonly sidecars: SidecarRegistryService,
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
      isError: dto.isError === true || dto.isError === 'true',
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

  /** B2：sidecar 注册回调（策略变更后治理台实时推送，替代/兜底 60s 轮询） */
  @Post('governance/sidecars/register')
  @Public()
  async registerSidecar(@Body('callbackUrl') callbackUrl: string) {
    return this.sidecars.register(callbackUrl);
  }

  /** 业务系统上报 AI 写副作用（D2-3c），落治理库 ai_tool_side_effects（幂等键去重） */
  @Post('effects')
  @Public()
  async reportEffect(@Body() dto: Record<string, unknown>): Promise<{ ok: boolean; effectId?: number }> {
    const userId = dto.userId != null ? String(dto.userId) : '0';
    const args = (dto.args as Record<string, unknown> | undefined) ?? {};
    const resultType = String(dto.resultType ?? 'external');
    const resultId = Number(dto.resultId ?? 0);
    const saved = await this.toolEffects.record(
      {
        userId,
        conversationId: dto.conversationId as string | undefined,
        toolName: String(dto.toolName ?? 'external'),
        args,
      },
      resultType,
      resultId,
    );
    return { ok: true, effectId: saved?.id };
  }
}
