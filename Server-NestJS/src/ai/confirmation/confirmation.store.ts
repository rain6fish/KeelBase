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

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
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
  ): Promise<{ token: string; decision: Promise<ConfirmationResolveResult> }> {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });

    await this.reqRepo
      .save(
        this.reqRepo.create({
          token,
          toolName,
          args: JSON.stringify(args),
          operatorId: userId,
          riskLevel: 'R3',
          status: 'pending',
        }),
      )
      .catch((err) => {
        // 落库失败不阻断确认流（内存仍可用），记录错误供审计排查
        console.error(`[ConfirmationStore] persist create failed: ${err.message}`);
      });

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

    this.pending.set(token, {
      token,
      userId,
      toolName,
      args,
      resolve: resolveFn,
      timer,
    });

    return { token, decision };
  }

  /**
   * 解析确认。校验 token 存在且属于请求用户，否则返回 false（controller 转 404）。
   * 同步更新库状态（approved/declined + decided_at）。
   * HS-6：trustTool 为 true 时，后续同工具写操作本会话免确认。
   */
  async resolve(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'reject',
    trustTool?: boolean,
  ): Promise<boolean> {
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== requestUserId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending.delete(token);
    await this.reqRepo
      .update(
        { token, status: 'pending' },
        { status: decision === 'approve' ? 'approved' : 'declined', decidedAt: new Date() },
      )
      .catch((err) => {
        console.error(`[ConfirmationStore] persist resolve failed: ${err.message}`);
      });
    pending.resolve({
      outcome: decision === 'approve' ? 'approve' : 'decline',
      trustTool,
    });
    return true;
  }

  /** 当前待确认数量（测试/观测用） */
  get pendingCount(): number {
    return this.pending.size;
  }
}
