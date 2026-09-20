// SPDX-License-Identifier: Apache-2.0

/**
 * GA 待我确认中心（docs/ai-action-center.spec.md §9）：**本人**确认记录的查询与**离线裁决**。
 *
 * 为什么独立成 service、而不是塞进 AiService：本功能与对话流无关（离线裁决正是「对话之外」），
 * 它需要的两个协作者——持久化行（repo）与裁决仲裁（ConfirmationStore）——本来都是独立对象。
 * 它与两个邻域各有一处耦合：批准后要执行工具（R4ApprovalService.executeApprovedTool），
 * 以及把存储行还原成人读信息（ToolPresentationService.describeConfirmation）。
 * 因此这里只做编排，**不复制**任何执行 / 审计 / 副作用登记逻辑。
 *
 * 生命周期与两个窗口见 specs/protocol/confirmation-lifecycle-v2-vector.json；wire 形状见
 * specs/protocol/schemas/v1/my-confirmation-item.schema.json。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';
import { R4ApprovalService } from '../approvals/r4-approval.service';
import { ToolPresentationService } from '../tools/tool-presentation.service';
import { ConfirmationStore, CONFIRMATION_STATUS, RunItem } from './confirmation.store';
import { ConfirmationImpact, RevokeClass } from '../interfaces/tool.interface';

/**
 * 本人确认记录（wire 契约 my-confirmation-item v1）。
 * `status` 取自 confirmation-lifecycle v2 的 states；`mode` 对齐 confirmation-request v3 的同一枚举
 * （immediate = R3 本人即时 / approval = R4 双人 / run = 一次授权整批）。
 */
export interface MyConfirmationItem {
  token: string;
  toolName: string;
  summary: string | null;
  arguments: Record<string, unknown>;
  mode: 'immediate' | 'approval' | 'run';
  riskLevel: string;
  status: 'pending' | 'approved' | 'declined' | 'timeout';
  impact: ConfirmationImpact | null;
  revokeClass: RevokeClass | null;
  run: { runId: string; riskLevel: string; items: RunItem[] } | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt?: string;
}

export type MyConfirmationDecision = 'approve' | 'decline' | 'reject';

@Injectable()
export class MyConfirmationService {
  constructor(
    @InjectRepository(AiConfirmationRequest)
    private readonly reqRepo: Repository<AiConfirmationRequest>,
    private readonly store: ConfirmationStore,
    private readonly presentation: ToolPresentationService,
    private readonly r4Approval: R4ApprovalService,
  ) {}

  /**
   * **本人**的确认记录。按 `operatorId` 收束——本人只看自己发起的确认，不看别人的。
   * `pending` 且**已超离线窗口**的行不返回：判据与 `expireStale` 一致，避免出现
   * 「窗口已过却还显示待确认、点下去必然失败」。
   */
  async list(
    userId: string,
    opts: { status?: MyConfirmationItem['status']; limit?: number } = {},
  ): Promise<MyConfirmationItem[]> {
    const offlineTtlMs = await this.store.offlineTtlMs();
    const rows = await this.reqRepo.find({
      where: opts.status ? { operatorId: userId, status: opts.status } : { operatorId: userId },
      order: { createdAt: 'DESC' },
      take: opts.limit ?? 50,
    });
    const cutoff = Date.now() - offlineTtlMs;
    return rows
      .filter((r) => r.status !== CONFIRMATION_STATUS.PENDING || (r.createdAt?.getTime() ?? 0) >= cutoff)
      .map((r) => this._toItem(r, offlineTtlMs));
  }

  /**
   * 离线裁决（confirmation-lifecycle v2 的 `via: out_of_band`）：用户在对话之外处理自己发起的确认。
   *
   * **安全热路径，三条硬约束**：
   * 1. **仲裁在 DB**——由 `ConfirmationStore.decideOutOfBand` 条件更新；`already_decided` 一律**不执行工具**，
   *    重复点击与「对话内同时点了」都不会二次执行。
   * 2. **只收本人单条 R3**——R4 是「待他人审批」（本人无权批，与 decideApproval 的 cannot-self-approve 同源），
   *    run 是整批授权（离开对话上下文无法完整回放），两者都拒绝。
   * 3. **执行复用同一条写管道**（`executeApprovedTool` → 底层写执行器）：门控复查 + 幂等 + 副作用登记。
   */
  async decide(
    token: string,
    userId: string,
    decision: MyConfirmationDecision,
  ): Promise<{ ok: boolean; message?: string; success?: boolean; resultId?: unknown }> {
    const row = await this.reqRepo.findOne({ where: { token } });
    // 越权与不存在同形（不泄露他人 token 是否存在）
    if (!row || row.operatorId !== userId) return { ok: false, message: 'not found' };
    if (row.kind === 'run') return { ok: false, message: 'run confirmation cannot be decided out of band' };
    if (row.riskLevel !== 'R3') return { ok: false, message: 'only own R3 confirmations can be decided out of band' };

    const res = await this.store.decideOutOfBand(token, userId, decision);
    if (!res.ok) {
      return { ok: false, message: res.reason === 'already_decided' ? 'already decided' : 'not found' };
    }
    // 走到这里 = 本次抢到了 pending→terminal 的转换，故至多执行一次
    if (decision === 'approve') {
      const result = await this.r4Approval.executeApprovedTool(row, 'R3 approved out-of-band via Action Center');
      return { ok: true, success: result.success, resultId: (result.data as any)?.id, message: result.error };
    }
    return { ok: true, success: false };
  }

  /** 存储行 → 本人视图。摘要 / 影响预览 / 撤销档由 AiService 单一真源产出（不在此重算）。 */
  private _toItem(row: AiConfirmationRequest, offlineTtlMs: number): MyConfirmationItem {
    let args: Record<string, unknown> = {};
    try {
      args = row.args ? (JSON.parse(row.args) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    const described = this.presentation.describeConfirmation(row);
    const createdAt = row.createdAt ?? new Date();
    return {
      token: row.token,
      toolName: row.toolName,
      summary: described.summary,
      arguments: args,
      mode: described.mode,
      riskLevel: row.riskLevel,
      status: row.status as MyConfirmationItem['status'],
      impact: described.impact,
      revokeClass: described.revokeClass,
      run: described.run,
      createdAt: createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      ...(row.status === CONFIRMATION_STATUS.PENDING
        ? { expiresAt: new Date(createdAt.getTime() + offlineTtlMs).toISOString() }
        : {}),
    };
  }
}
