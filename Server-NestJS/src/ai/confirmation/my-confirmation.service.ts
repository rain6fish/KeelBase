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
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';
import { R4ApprovalService } from '../approvals/r4-approval.service';
import { ToolPresentationService } from '../tools/tool-presentation.service';
import { ConfirmationStore, CONFIRMATION_STATUS, RunItem, isWithinOfflineWindow } from './confirmation.store';
import type { ConfirmationStatus } from './confirmation.store';
import { ExecutionState, deriveExecutionState } from './execution-state';
import { ConfirmationImpact, PresentationText, RevokeClass, ToolResult } from '../interfaces/tool.interface';
import { ConversationService } from '../conversation/conversation.service';

/**
 * 本人确认记录（wire 契约 my-confirmation-item v1）。
 * `status` 取自 confirmation-lifecycle v2 的 states；`mode` 对齐 confirmation-request v3 的同一枚举
 * （immediate = R3 本人即时 / approval = R4 双人 / run = 一次授权整批）。
 */
export interface MyConfirmationItem {
  token: string;
  toolName: string;
  summary: PresentationText | null;
  arguments: Record<string, unknown>;
  mode: 'immediate' | 'approval' | 'run';
  riskLevel: string;
  status: ConfirmationStatus;
  impact: ConfirmationImpact | null;
  revokeClass: RevokeClass | null;
  run: { runId: string; riskLevel: string; items: RunItem[] } | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt?: string;
  /** P2 执行轴：非 approved 行为 null（本人批复的写同样可能「批准了但没跑成」）。
   *  P2 execution axis; null unless approved. 见 wire my-confirmation-item v2。 */
  executionState: ExecutionState | null;
  executedAt: string | null;
  executionError: string | null;
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
    /**
     * CONF-6: write-back port for late decisions. `@Optional` keeps trimmed assemblies / unit tests
     * able to omit it.
     * CONF-6：迟到裁决的「回写对话」出口。`@Optional` 让裁剪装配 / 单测仍可省略。
     */
    @Optional() private readonly conversation?: ConversationService,
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
    // Predicate is shared with `expireStale` (see `isWithinOfflineWindow`) — this used to compute
    // its own cutoff in memory while the sweep computed one in SQL.
    // 判据与 `expireStale` 单源共用（见 `isWithinOfflineWindow`）—— 原先这里在内存里自算 cutoff，
    // 而清扫任务用 SQL 另算一份。
    return rows
      .filter((r) => r.status !== CONFIRMATION_STATUS.PENDING || isWithinOfflineWindow(r.createdAt, offlineTtlMs))
      .map((r) => this._toItem(r));
  }

  /**
   * Out-of-band decision (confirmation-lifecycle v2 `via: out_of_band`): the user handles a
   * confirmation they initiated from outside the conversation.
   *
   * **Security hot path, three hard constraints**:
   * 1. **Arbitration is in the DB** — `ConfirmationStore.decideOutOfBand` performs the conditional
   *    update; `already_decided` never executes the tool, so repeat clicks and a concurrent
   *    in-conversation decision cannot run it twice.
   * 2. **Only the operator's single R3 row** — R4 is "waiting on someone else" (no self-approval,
   *    same source as `decideApproval`'s cannot-self-approve), and a run is a batch authorization
   *    that cannot be replayed without the conversation context.
   * 3. **Execution reuses the same write pipeline** (`executeApprovedTool` → underlying write
   *    executor): gate re-check + idempotency + side-effect recording.
   *
   * **CONF-6: after winning the arbitration, the late outcome is written back into the originating
   * conversation** as a system note. The dialogue was already told "User did not respond in time",
   * yet this decision then actually executed the tool; without the note the agent treats "not done"
   * as the truth and may redo the step (external MCP / GUI clicks have no idempotency key to hit —
   * that retry is a real second execution). The write-back touches no in-memory wait and executes
   * nothing — only the winner of `pending→terminal` ever runs the tool, at most once.
   *
   * 离线裁决（confirmation-lifecycle v2 的 `via: out_of_band`）：用户在对话之外处理自己发起的确认。
   *
   * **安全热路径，三条硬约束**：
   * 1. **仲裁在 DB**——由 `ConfirmationStore.decideOutOfBand` 条件更新；`already_decided` 一律**不执行工具**，
   *    重复点击与「对话内同时点了」都不会二次执行。
   * 2. **只收本人单条 R3**——R4 是「待他人审批」（本人无权批，与 decideApproval 的 cannot-self-approve 同源），
   *    run 是整批授权（离开对话上下文无法完整回放），两者都拒绝。
   * 3. **执行复用同一条写管道**（`executeApprovedTool` → 底层写执行器）：门控复查 + 幂等 + 副作用登记。
   *
   * **CONF-6：抢到仲裁之后，把「迟到的终态」回写原对话**（一条 system 注记）。对话在等待窗口超时时
   * 已被告知 `User did not respond in time`，而这次裁决随后真的执行了工具；不回写的话，agent 会把
   * 「没做」当成事实并重做同一步（外部 MCP / GUI 点击没有幂等键可命中 ⇒ 真第二次执行）。回写**不**
   * 触碰内存等待、也**不**执行工具——执行只发生在本次抢到 `pending→terminal` 的那一方，最多一次。
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
      await this._recordLateDecision(row, decision, result);
      return { ok: true, success: result.success, resultId: (result.data as any)?.id, message: result.error };
    }
    await this._recordLateDecision(row, decision);
    return { ok: true, success: false };
  }

  /**
   * CONF-6: write the late decision back into the originating conversation as one system message, so
   * the next agent turn sees the truth instead of "timed out". Only the arbitration winner calls this
   * (the `already_decided` / out-of-window path returns earlier), so it never duplicates the note.
   * Failure to append must not fail the decision itself — the row already holds the fact.
   *
   * CONF-6：把迟到的终态作为一条 system 消息回写原对话，让 agent 下一轮看到事实而不是「超时」。
   * 只有仲裁胜者会走到这里（`already_decided` / 过窗路径已提前返回），因此注记不会重复。
   * 回写失败不得让裁决本身失败 —— 事实已经落在行上。
   */
  private async _recordLateDecision(
    row: AiConfirmationRequest,
    decision: MyConfirmationDecision,
    result?: ToolResult,
  ): Promise<void> {
    if (!row.conversationId || !this.conversation) return;
    const at = new Date().toISOString();
    let content: string;
    if (decision === 'approve') {
      const effectId = (result?.data as { id?: unknown } | undefined)?.id;
      content = result?.success
        ? `[out-of-band decision] The write tool "${row.toolName}" was approved later from the Action Center at ${at} and the write pipeline reported success (resultId: ${String(effectId ?? 'unknown')}). Do not run it again.`
        : `[out-of-band decision] The write tool "${row.toolName}" was approved later from the Action Center at ${at}, but the write pipeline did not report success: ${result?.error ?? 'unknown error'}. Do not run it again without the user's request.`;
    } else {
      content = `[out-of-band decision] The write tool "${row.toolName}" was declined later from the Action Center at ${at}. No tool ran; do not run it again without the user's request.`;
    }
    try {
      await this.conversation.appendMessage(row.conversationId, { role: 'system', content });
    } catch (err) {
      console.error(
        `[MyConfirmationService] failed to record the late decision in conversation ${row.conversationId}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** 存储行 → 本人视图。摘要 / 影响预览 / 撤销档由 AiService 单一真源产出（不在此重算）。 */
  private _toItem(row: AiConfirmationRequest): MyConfirmationItem {
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
      // REV-7：窗口读**记录下来的**那一个，不再按当前配置重算 —— 重算会让改配置追溯性地挪走历史行的
      // 窗口（旧实现正是如此）。引入本列之前的行没有记录，**省略**该字段而不是拿今天的配置去猜它。
      ...(row.status === CONFIRMATION_STATUS.PENDING && row.expiresAt
        ? { expiresAt: row.expiresAt.toISOString() }
        : {}),
      // P2 执行轴（单源推导，与治理端审批列表同一函数）——租约列是内部状态，不外泄
      executionState: deriveExecutionState(row),
      executedAt: row.executedAt ? row.executedAt.toISOString() : null,
      executionError: row.executionError ?? null,
    };
  }
}
