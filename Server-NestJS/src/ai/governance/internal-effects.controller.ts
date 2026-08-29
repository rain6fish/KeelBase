import { Controller, Post, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { Public } from '../../auth/guards/public.decorator';
import { GovernanceApiGuard } from '../../governance/governance-api.guard';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';

/**
 * D2-4 业务系统撤销回调端点（服务身份）：独立治理台撤销副作用时回调本系统，
 * 本端点调 AiToolEffectsService.revoke（本地软删，可回收站恢复）。
 * 认证：GOVERNANCE_API_KEY（与治理台共享，x-api-key/Bearer）。
 */
@Controller({ path: 'internal/effects', version: '1' })
@UseGuards(GovernanceApiGuard)
export class InternalEffectsController {
  constructor(private readonly toolEffects: AiToolEffectsService) {}

  /** 治理台回调：撤销本系统 AI 创建的副作用 */
  @Post('revoke')
  @Public()
  async revoke(@Body() dto: { effectId?: number }): Promise<unknown> {
    const effectId = Number(dto?.effectId);
    if (!Number.isFinite(effectId) || effectId <= 0) {
      throw new NotFoundException('effectId 缺失或非法');
    }
    const result = await this.toolEffects.revoke(effectId);
    if (!result) throw new NotFoundException('副作用记录不存在');
    return result;
  }
}
