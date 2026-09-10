// SPDX-License-Identifier: Apache-2.0

/**
 * 写入操作人工确认存储 — ConfirmationStore
 *
 * AI 流式对话中写工具被调用时，生成一个短时 token，
 * 通过 SSE confirmation_request 事件发给客户端等待人工决策。
 * 客户端调用 POST /ai/confirmations/:token 后，这里 resolve 对应的 pending promise。
 *
 * D2-1e 持久化：R3 确认请求同时落 ai_confirmation_requests 表（riskLevel=R3，status=pending）
 * ——服务器重启 pending 不丢、为独立治理控制平面的跨服务确认铺路（治理台裁决 → 业务系统回调）。
 * 内存 Map 保留用于「决策 Promise 的即时回调」（等待机制），DB 为持久化事实源。
 */

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';

export type ConfirmationOutcome = 'approve' | 'decline' | 'timeout';

/** KB-5 run-level approval：run 批内单个动作（工具名 + 参数 + 人读摘要 + 自身风险级） */
export interface RunItem {
  toolName: string;
  args: Record<string, unknown>;
  /** 人读 diff 摘要（"创建事件：产品评审…"）；无摘要动作不进 run（§3.3 诚实降级） */
  summary: string;
  riskLevel: string;
}

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** KB-5：'single'（默认，单动作）/ 'run'（一次授权整批，token = runId） */
  kind?: 'single' | 'run';
  /** HS-6：本次会话是否信任该工具（后续免确认） */
  trustTool?: boolean;
  resolve: (result: ConfirmationResolveResult) => void;
  timer: NodeJS.Timeout;
}

export interface ConfirmationResolveResult {
  outcome: ConfirmationOutcome;
  trustTool?: boolean;
}

@Injectable()
export class ConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(AiConfirmationRequest)
    private readonly reqRepo: Repository<AiConfirmationRequest>,
    @Optional() ttlMs?: number,
  ) {
    this.ttlMs = ttlMs ?? 60_000;
  }

  /**
   * 创建待确认项，返回 token 与可等待的决策 Promise。
   * R3 确认请求落库（ai_confirmation_requests，riskLevel=R3）——持久化事实源。
   * TTL 超时后自动 resolve('timeout') 并更新库状态，避免 pending promise 泄漏。
   * @param ttlMs 覆盖默认 TTL（HS-6：经 Settings 可配，如 confirmation_ttl_seconds）
   */
  async create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    ttlMs?: number,
    conversationId?: string,
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });
    await this._persist({ token, toolName, args: JSON.stringify(args), operatorId: userId, riskLevel: 'R3', kind: 'single', conversationId });
    const timer = this._setupTimer(token, ttlMs);
    this.pending.set(token, { token, userId, toolName, args, kind: 'single', resolve: resolveFn, timer });
    return { token, decision };
  }

  /**
   * KB-5 run-level approval（docs/run-level-approval.spec.md §2.4）：一次授权整批。
   * token 即 runId（§2.3 允许 token=runId）；落库单行 kind='run' + run_items 快照 + riskLevel=runRisk。
   * 前端 POST 同一 run token approve/reject → resolve 该 run 的 decision（一次放行整批/整批跳过）。
   */
  async createRun(
    userId: string,
    items: RunItem[],
    riskLevel: string,
    ttlMs?: number,
    conversationId?: string,
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });
    await this._persist({
      token,
      toolName: 'run',
      args: '[]',
      operatorId: userId,
      riskLevel,
      kind: 'run',
      runItems: JSON.stringify(items),
      conversationId,
    });
    const timer = this._setupTimer(token, ttlMs);
    this.pending.set(token, { token, userId, toolName: 'run', args: {}, kind: 'run', resolve: resolveFn, timer });
    return { token, decision };
  }

  /** 落库待确认记录（create / createRun 共用；失败不阻断内存确认流，记错误供审计排查） */
  private async _persist(row: {
    token: string;
    toolName: string;
    args: string;
    operatorId: string;
    riskLevel: string;
    kind: 'single' | 'run';
    runItems?: string;
    conversationId?: string;
  }): Promise<void> {
    await this.reqRepo
      .save(
        this.reqRepo.create({
          token: row.token,
          toolName: row.toolName,
          args: row.args,
          operatorId: row.operatorId,
          riskLevel: row.riskLevel,
          kind: row.kind,
          status: 'pending',
          ...(row.runItems !== undefined ? { runItems: row.runItems } : {}),
          // docs/run-level-approval.spec.md §2.4：run 记录须携带 conversationId，服务器重启后按会话可查可裁决
          ...(row.conversationId !== undefined ? { conversationId: row.conversationId } : {}),
        }),
      )
      .catch((err) => {
        console.error(`[ConfirmationStore] persist create failed: ${err.message}`);
      });
  }

  /** TTL 定时器：超时自动 resolve('timeout') + 更新库状态（create / createRun 共用） */
  private _setupTimer(token: string, ttlMs?: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      const pending = this.pending.get(token);
      if (pending) {
        this.pending.delete(token);
        void this.reqRepo
          .update({ token, status: 'pending' }, { status: 'timeout', decidedAt: new Date() })
          .catch(() => {});
        pending.resolve({ outcome: 'timeout' });
      }
    }, ttlMs ?? this.ttlMs);
    timer.unref?.();
    return timer;
  }

  /**
   * 解析确认。校验 token 存在且属于请求用户，否则返回 false（controller 转 404）。
   * 同步更新库状态（approved/declined + decided_at）。
   * HS-6：trustTool 为 true 时，后续同工具写操作本会话免确认。
   */
  async resolve(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'decline' | 'reject',
    trustTool?: boolean,
  ): Promise<boolean> {
    // 决策词统一（CE-1 B3b）：规范集 approve | decline；legacy `reject` 归一为 decline。
    const outcome: 'approve' | 'decline' = decision === 'approve' ? 'approve' : 'decline';
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== requestUserId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending.delete(token);
    await this.reqRepo
      .update(
        { token, status: 'pending' },
        { status: outcome === 'approve' ? 'approved' : 'declined', decidedAt: new Date() },
      )
      .catch((err) => {
        console.error(`[ConfirmationStore] persist resolve failed: ${err.message}`);
      });
    pending.resolve({
      outcome,
      trustTool,
    });
    return true;
  }

  /** 当前待确认数量（测试/观测用） */
  get pendingCount(): number {
    return this.pending.size;
  }
}
