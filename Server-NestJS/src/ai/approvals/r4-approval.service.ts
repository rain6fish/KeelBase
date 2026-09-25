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
import {
  ExecutionState,
  deriveExecutionState,
  isExecutionClaimable,
} from '../confirmation/execution-state';

/** 管理端审批列表项 = 行投影（显式白名单，见 `_toWireItem`）+ 用户名 + 执行态。 */
export type ApprovalListItem = {
  id: number;
  token: string;
  toolName: string;
  args: string;
  operatorId: string;
  conversationId: string | null;
  riskLevel: string;
  status: string;
  /** 契约要求非空且取单值枚举；迁移前旧行为 NULL，查询层已按 single 处理，投影处同口径归一 */
  kind: 'single' | 'run';
  runItems: string | null;
  approverId: string | null;
  decidedAt: string | null;
  createdAt: string;
  operatorName?: string;
  approverName: string | null;
  /** 执行轴（P2）——非 approved 行为 null */
  executionState: ExecutionState | null;
  executedAt: string | null;
  executionError: string | null;
};

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

  /**
   * 创建持久化审批请求（operator 触发，approver 稍后决策；不阻塞 operator 对话）。
   * `audience` = 该 artifact 被批准写往的目的地（AUTHZ-1）——R4 的等待窗口可达小时/天级，
   * 正是目的地可能被改指的那种窗口，故这里的绑定最吃重。
   */
  async createR4ApprovalRequest(
    operatorId: string,
    toolName: string,
    args: Record<string, unknown>,
    conversationId?: string,
    audience?: string,
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
        ...(audience !== undefined ? { audience } : {}),
      }),
    );
    return { token, id: saved.id };
  }

  /**
   * 行 → wire 投影（**显式白名单**）。
   *
   * 为什么不再直接返回实体：P2 给实体加了 `executionClaimedAt`（执行**租约**，内部并发控制用），
   * 而契约 `governance-confirmation-item` 是 `additionalProperties: false` —— 直接透传会把内部列泄进响应。
   * 白名单同时让「响应形状 == 契约形状」成为可读事实，而不是靠实体定义碰巧对得上。
   *
   * Project the row explicitly rather than returning the entity: the P2 lease column is internal
   * concurrency state, and the contract forbids extra properties.
   */
  private _toWireItem(
    row: AiConfirmationRequest & { operatorName?: string; approverName?: string },
    now: number,
  ): ApprovalListItem {
    return {
      id: row.id,
      token: row.token,
      toolName: row.toolName,
      args: row.args,
      operatorId: row.operatorId,
      conversationId: row.conversationId ?? null,
      riskLevel: row.riskLevel,
      status: row.status,
      kind: row.kind === 'run' ? 'run' : 'single',
      runItems: row.runItems ?? null,
      approverId: row.approverId ?? null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      ...(row.operatorName !== undefined ? { operatorName: row.operatorName } : {}),
      approverName: row.approverName ?? null,
      executionState: deriveExecutionState(row, now),
      executedAt: row.executedAt ? row.executedAt.toISOString() : null,
      executionError: row.executionError ?? null,
    };
  }

  /** 待审批 R4 列表（管理端审批页）。 */
  async listPendingApprovals(limit = 50): Promise<ApprovalListItem[]> {
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
    const now = Date.now();
    const rows = await this.withUserNames(items);
    return rows.map((r) => this._toWireItem(r, now));
  }

  /** 已审批历史（管理端审批页）。 */
  async listDecidedApprovals(limit = 50): Promise<ApprovalListItem[]> {
    if (!this.approvalsRepo) return [];
    const base = { status: In(['approved', 'declined']), riskLevel: 'R4' };
    const items = await this.approvalsRepo.find({
      where: [{ ...base, kind: 'single' }, { ...base, kind: IsNull() }],
      order: { decidedAt: 'DESC' },
      take: limit,
    });
    const now = Date.now();
    const rows = await this.withUserNames(items);
    return rows.map((r) => this._toWireItem(r, now));
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
    // The conditional update is the **sole arbitration point** — the same stance
    // `ConfirmationStore.decideOutOfBand` already takes. When two approvers decide at once,
    // exactly one gets affected=1 and only that one executes the tool. The previous
    // read-modify-write (`findOne` then `save`) let both pass the `pending` check, so the high-risk
    // write tool ran twice.
    //
    // 条件更新是**唯一仲裁点** —— 与 `ConfirmationStore.decideOutOfBand` 同一口径。
    // 双人并发裁决时只有一方 affected=1，也只有那一方执行工具；
    // 原先的 `findOne` + `save` 读改写会让两人都通过 pending 检查 → 高风险写工具执行两次。
    const res = await this.approvalsRepo.update(
      { token, status: 'pending' },
      {
        status: decision === 'approve' ? 'approved' : 'declined',
        approverId,
        decidedAt: new Date(),
      },
    );
    if (!res || res.affected === undefined || res.affected === 0) {
      return { ok: false, message: 'already decided' };
    }
    // 状态已由上面的条件更新落库；这里只回填 `executeApprovedTool` 默认注记要用的审批人
    req.approverId = approverId;

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
  async executeApprovedTool(
    req: AiConfirmationRequest,
    outcomeNote?: string,
    opts: { retry?: boolean } = {},
  ): Promise<ToolResult> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(req.args || '{}');
    } catch {
      args = {};
    }

    // Claim the execution (a lease). A retry clears a stale claim first, so the claim below is the
    // atomic gate: exactly one caller gets a hit and only that one runs the tool — a retry cannot
    // race a live execution.
    // 认领这次执行（租约）。重试会先清掉过期认领，故下面的条件更新就是原子闸门：只有一方命中、
    // 也只有那一方跑工具——重试不会与在途执行撞车。
    if (!(await this._claimExecution(req.token, opts.retry === true))) {
      return { success: false, error: 'execution already in progress or already completed' };
    }

    const note = outcomeNote ?? `R4 approved by approver ${req.approverId}`;
    let result: ToolResult;
    try {
      // AUTHZ-1：把 artifact 的 audience 带到执行点——本行从签发到执行跨请求（R4 可达小时/天级、
      // Action Center 离线裁决亦然），目的地在这段窗口里可被改指，故校验必须在执行点做。
      result = await this.toolExecution.executeWrite(
        req.toolName,
        args,
        req.operatorId,
        req.conversationId,
        undefined,
        req.audience ? { audience: req.audience } : undefined,
      );
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    await this._settleExecution(req.token, result);
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

  /**
   * Claim one execution attempt (the lease). The conditional update is the sole arbitration point:
   * only the caller that gets a hit may run the tool. `allowRetry` first clears a previous claim —
   * that clear is itself idempotent, so two concurrent retries still produce exactly one winner.
   *
   * `affected === 0` is the only value that refuses; an `update` that reports no count at all is
   * treated as a hit, matching the tolerance `ConfirmationStore.resolve` already documents for
   * drivers that omit the field. A real driver always reports it.
   *
   * 认领一次执行（租约）。条件更新是唯一仲裁点：只有命中者可以跑工具。`allowRetry` 会先清掉上一次认领
   * —— 该清空本身幂等，故两次并发重试仍只有一方胜出。只有 `affected === 0` 才拒绝；驱动完全没报行数时
   * 视为命中（与 `ConfirmationStore.resolve` 已记录的宽容口径一致；真实驱动总会报）。
   */
  private async _claimExecution(token: string, allowRetry: boolean): Promise<boolean> {
    if (!this.approvalsRepo) return true; // 无仓储（单测/裁剪装配）→ 保持拆分前行为：直接执行
    if (allowRetry) {
      await this.approvalsRepo.update(
        { token, status: 'approved', executedAt: IsNull() },
        { executionClaimedAt: null },
      );
    }
    const res = await this.approvalsRepo.update(
      { token, status: 'approved', executedAt: IsNull(), executionClaimedAt: IsNull() },
      { executionClaimedAt: new Date() },
    );
    return res?.affected !== 0;
  }

  /**
   * Record the attempt's outcome. Success stamps `executedAt` and clears the error; a failure keeps
   * the claim (so the row reads `failed` once the lease expires) and stores the reason. A crash
   * never reaches here at all — that is exactly the case whose absence of a recorded result the
   * outward `failed` state has to admit.
   *
   * 落这次尝试的结果。成功写 `executedAt` 并清错误；失败保留认领（租约过期后该行即报 failed）并记原因。
   * 崩溃根本走不到这里 —— 这正是对外 `failed` 必须承认的「没有记录结果」那种情形。
   */
  private async _settleExecution(token: string, result: ToolResult): Promise<void> {
    if (!this.approvalsRepo) return;
    if (result.success) {
      await this.approvalsRepo.update({ token }, { executedAt: new Date(), executionError: null });
      return;
    }
    await this.approvalsRepo.update(
      { token },
      { executionError: result.error ?? 'execution failed' },
    );
  }

  /**
   * P2 retry entry: run an approved-but-not-succeeded confirmation again.
   *
   * Refused when the token is unknown, the row is not `approved`, it already succeeded, or its
   * claim is **still fresh** (the execution may be running right now — refusing there is what keeps
   * a retry from racing it). Re-running is safe because the write pipeline is idempotent, so no
   * second side effect is produced.
   *
   * P2 重试入口：把一条「已批准但未成功执行」的确认重跑一次。以下情形拒绝：token 不存在、
   * 行非 approved、已成功、或认领**仍新鲜**（可能正在执行——拒绝正是为了不让重试与它撞车）。
   * 重跑是安全的：写管道自带幂等，不会产生第二次副作用。
   */
  async retryExecution(
    token: string,
  ): Promise<{ ok: boolean; reason?: 'not_found' | 'not_retryable'; message?: string; success?: boolean; resultId?: unknown }> {
    if (!this.approvalsRepo) return { ok: false, reason: 'not_retryable', message: 'not supported' };
    const row = await this.approvalsRepo.findOne({ where: { token } });
    if (!row) return { ok: false, reason: 'not_found', message: 'not found' };
    if (row.executedAt) return { ok: false, reason: 'not_retryable', message: 'already executed' };
    if (!isExecutionClaimable(row)) {
      return { ok: false, reason: 'not_retryable', message: 'execution in progress' };
    }
    if (row.status !== 'approved') {
      return { ok: false, reason: 'not_retryable', message: `cannot retry a ${row.status} confirmation` };
    }

    const result = await this.executeApprovedTool(row, 'R4 execution retried by admin', {
      retry: true,
    });
    return {
      ok: true,
      success: result.success,
      resultId: (result.data as { id?: unknown } | undefined)?.id,
      message: result.error,
    };
  }
}
