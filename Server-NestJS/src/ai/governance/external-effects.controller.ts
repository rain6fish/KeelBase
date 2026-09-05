// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { Public } from '../../auth/guards/public.decorator';
import { GovernanceApiGuard } from '../../governance/governance-api.guard';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';

/**
 * 服务身份查询 AI 副作用状态（B 路径反向，Java 接入方对账用）：
 * `GET /external/effects/:resultType/:resultId` → 某业务动作（如 followup/7）的 AI 副作用
 * 是否存在 + 是否已撤销（目标软删）。
 *
 * 认证：GOVERNANCE_API_KEY（服务身份，x-api-key/Bearer）——与治理台回调同钥。
 * 撤销态真值只在主应用（治理库无业务实体）；本地实体 `revoked = targetSoftDeleted`；
 * B 路径 proxy_call 的撤销经 Java 补偿端点（主库 effect 无撤销列）→ `revokeHint` 明示需查 Java 侧。
 */
@Controller({ path: 'external/effects', version: '1' })
@UseGuards(GovernanceApiGuard)
export class ExternalEffectsController {
  constructor(private readonly toolEffects: AiToolEffectsService) {}

  @Get(':resultType/:resultId')
  @Public()
  async status(
    @Param('resultType') resultType: string,
    @Param('resultId') resultId: string,
  ): Promise<unknown> {
    const id = Number(resultId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new NotFoundException('resultId 非法（须为正整数）');
    }
    const effect = await this.toolEffects.findByTarget(resultType, id);
    if (!effect) {
      throw new NotFoundException('该业务动作无 AI 副作用记录（非 AI 创建或已不存在）');
    }
    const target = await this.toolEffects.describeTarget(resultType, id);
    const isExternalProxy = effect.resultType === 'proxy_call';
    return {
      effect: {
        id: effect.id,
        toolName: effect.toolName,
        userId: effect.userId,
        conversationId: effect.conversationId ?? null,
        resultType: effect.resultType,
        resultId: effect.resultId,
        createdAt: effect.createdAt,
      },
      target,
      revoked: target.targetSoftDeleted,
      revokeHint: isExternalProxy
        ? 'B 路径外部副作用：撤销经 Java 补偿端点，撤销态需在 Java 侧确认'
        : undefined,
    };
  }
}
