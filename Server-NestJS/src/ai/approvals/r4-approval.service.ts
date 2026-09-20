// SPDX-License-Identifier: Apache-2.0

/**
 * R4 双人审批（W5 Risk-based Tool Contract；从 `AiService` 拆出的第三个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * R4 高影响动作需要**第二人**审批：operator 发起（不阻塞对话）→ approver 稍后裁决 → 以 operator 维度执行。
 * 本服务管的是这条**生命周期**：创建请求、待批/已批列表、裁决、裁决后执行。
 *
 * 裁决后的执行复用写管道（`ToolExecutionService.executeWrite`）——门控复查 + 幂等 + 副作用登记 + 审计，
 * 一行都不另写。R3 的**离线裁决**（Action Center）走的也是这个方法，同一条管道。
 *
 * 与呈现面的分工：把一条确认行还原成「人读摘要 / 影响预览 / 撤销档 / 展示模式」的 `describeConfirmation`
 * **不在本服务**——它要 `writeToolSummary` / `writeImpact` / `revokeClass` 三个呈现侧知识，
 * 属另一刀（呈现/摘要域），现由 `ToolPresentationService` 提供。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiConfirmationRequest } from './ai-confirmation-request.entity';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { AuditService } from '../audit/audit.service';
import { deriveAiBusinessEvent } from '../audit/ai-business-event';
import { ToolResult } from '../interfaces/tool.interface';
import { UsersService } from '../../users/users.service';

@Injectable()
export class R4ApprovalService {
  constructor(
    private readonly toolExecution: ToolExecutionService,
    private readonly auditService: AuditService,
    // 未注入时各方法降级（单测/裁剪场景），与拆分前 `this.approvalsRepo?` / `this.usersService?` 同一语义
    @Optional()
    @InjectRepository(AiConfirmationRequest)
    private readonly approvalsRepo?: Repository<AiConfirmationRequest>,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  /** 创建持久化审批请求（operator 触发，approver 稍后决策；不阻塞 operator 对话）。 */
  async createR4ApprovalRequest(
    operatorId: string,
    toolName: string,
    args: Record<string, unknown>,
    conversationId?: string,
  ): Promise<{ token: string; id: number }> {
    if (!this.approvalsRepo) throw new Error('Approvals repository not injected');
    const token = randomUUID();
    const saved = await this.approvalsRepo.save(
      this.approvalsRepo.create({
        token,
        toolName,
        args: JSON.stringify(args),
        operatorId,
        riskLevel: 'R4',
        status: 'pending',
        conversationId,
      }),
    );
    return { token, id: saved.id };
  }

  /** 待审批 R4 列表（管理端审批页）。 */
  async listPendingApprovals(limit = 50): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.approvalsRepo) return [];
    // D2-1e：R3 确认也落库（riskLevel=R3），R4 审批列表只列 R4 高影响请求，避免混入。
    // KB-5：另排除 kind='run' 的整批授权聚合行——R4 工具经策略降为同步确认并入 run 后，
    // 该行 riskLevel=runRisk 可能为 'R4'，但它不是单个审批请求（toolName='run'），混入即伪审批。
    // 单条行 kind 为 'single'，迁移前旧行为 NULL——两者都保留。
    const base = { status: 'pending' as const, riskLevel: 'R4' as const };
    const items = await this.approvalsRepo.find({
      where: [{ ...base, kind: 'single' }, { ...base, kind: IsNull() }],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return this.withUserNames(items);
  }

  /** 已审批历史（管理端审批页）。 */
  async listDecidedApprovals(limit = 50): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.approvalsRepo) return [];
    const base = { status: In(['approved', 'declined']), riskLevel: 'R4' };
    const items = await this.approvalsRepo.find({
      where: [{ ...base, kind: 'single' }, { ...base, kind: IsNull() }],
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    return this.withUserNames(items);
  }

  /** 审批路径可见：为审批列表附提交人/审批人用户名（operator → approver），审批路上的人可读。 */
  private async withUserNames(items: AiConfirmationRequest[]): Promise<Array<AiConfirmationRequest & { operatorName?: string; approverName?: string }>> {
    if (!this.usersService) return items;
    const ids = [
      ...new Set(
        items.flatMap((i) => [Number(i.operatorId), i.approverId ? Number(i.approverId) : null].filter((x): x is number => x != null)),
      ),
    ];
    const nameById = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const u = await this.usersService!.findOne(id, true);
          if (u.username) nameById.set(String(id), u.username);
        } catch {
          // 用户可能已删除
        }
      }),
    );
    return items.map((i) => ({
      ...i,
      operatorName: nameById.get(String(i.operatorId)) || String(i.operatorId),
      approverName: i.approverId ? nameById.get(String(i.approverId)) || String(i.approverId) : undefined,
    }));
  }

  /** approver 决策：approve → 以 operator 维度执行工具；decline → 拒绝。 */
  async decideApproval(
    token: string,
    approverId: string,
    decision: 'approve' | 'decline',
  ): Promise<{ ok: boolean; message?: string; success?: boolean; resultId?: unknown }> {
    if (!this.approvalsRepo) return { ok: false, message: 'not supported' };
    const req = await this.approvalsRepo.findOne({ where: { token } });
    if (!req || req.status !== 'pending') {
      return { ok: false, message: req ? 'already decided' : 'not found' };
    }
    // KB-5：run 聚合行（kind='run'，toolName='run'）不是单个审批请求——生命周期由 ConfirmationStore 的
    // run token 决策驱动。此处放行会把 run 行状态越权翻成 approved/declined，绕过 run 语义（且在途 SSE 决策
    // 仍挂在内存 promise 上）。该端点服务身份可达，故在边界拒绝，不依赖「列表不显示 run 行」这层约定。
    if (req.kind === 'run') {
      return { ok: false, message: 'run confirmation cannot be decided via approval endpoint' };
    }
    if (decision === 'approve' && req.operatorId === approverId) {
      return { ok: false, message: 'cannot self-approve' };
    }
    req.status = decision === 'approve' ? 'approved' : 'declined';
    req.approverId = approverId;
    req.decidedAt = new Date();
    await this.approvalsRepo.save(req);

    if (decision === 'approve') {
      const result = await this.executeApprovedTool(req);
      return { ok: true, success: result.success, resultId: (result.data as any)?.id, message: result.error };
    }
    return { ok: true, success: false };
  }

  /**
   * 裁决通过后以 operator 维度执行工具：复用写工具执行（幂等 + 副作用登记）+ 审计。
   * `outcomeNote` 记录**谁在哪儿批的**（R4 审批人 / R3 离线裁决），进 `tool_call` 审计行便于追溯。
   */
  async executeApprovedTool(req: AiConfirmationRequest, outcomeNote?: string): Promise<ToolResult> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(req.args || '{}');
    } catch {
      args = {};
    }
    const note = outcomeNote ?? `R4 approved by approver ${req.approverId}`;
    let result: ToolResult;
    try {
      result = await this.toolExecution.executeWrite(req.toolName, args, req.operatorId, req.conversationId);
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    await this.auditService.log({
      userId: req.operatorId,
      conversationId: req.conversationId,
      action: 'tool_call',
      detail: `${req.toolName}(${JSON.stringify(args)})`,
      isError: !result.success,
      errorMessage: result.success ? note : `${note}; execution failed: ${result.error}`,
      // 工具内部自调 LLM 时的开销记在工具自己这行
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      // §internal.16 A-1 业务事件名
      businessEvent: deriveAiBusinessEvent(req.toolName) ?? undefined,
    });
    return result;
  }
}
