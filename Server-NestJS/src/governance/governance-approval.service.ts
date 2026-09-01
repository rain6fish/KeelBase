// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AiConfirmationRequest } from '../ai/approvals/ai-confirmation-request.entity';

/**
 * D2-2 独立治理台：审批 CRUD（读侧）——从 AiService 抽取，只依赖 approvalsRepo（治理自有表）。
 * D2-2d 边界：决策（approve 后执行工具）深度耦合主应用 AiService，治理台只读审批列表；
 * 决策落库 + 主应用回调执行在 D2-4 跨服务化。
 */
@Injectable()
export class GovernanceApprovalService {
  constructor(
    @InjectRepository(AiConfirmationRequest)
    private readonly approvalsRepo: Repository<AiConfirmationRequest>,
  ) {}

  /** 待审批列表（R4 高影响请求，管理台审批页） */
  async listPendingApprovals(limit = 50): Promise<AiConfirmationRequest[]> {
    return this.approvalsRepo.find({
      where: { status: 'pending', riskLevel: 'R4' },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** 已审批历史（管理台审批页） */
  async listDecidedApprovals(limit = 50): Promise<AiConfirmationRequest[]> {
    return this.approvalsRepo.find({
      where: { status: In(['approved', 'declined']), riskLevel: 'R4' },
      order: { decidedAt: 'DESC' },
      take: limit,
    });
  }
}
