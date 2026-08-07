/**
 * 写入操作人工确认存储 — ConfirmationStore
 *
 * AI 流式对话中写工具被调用时，生成一个短时 token，
 * 通过 SSE confirmation_request 事件发给客户端等待人工决策。
 * 客户端调用 POST /ai/confirmations/:token 后，这里 resolve 对应的 pending promise。
 *
 * 内存存储：服务器重启清空（可接受，pending 请求会超时）。
 */

import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type ConfirmationOutcome = 'approve' | 'decline' | 'timeout';

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
  resolve: (outcome: ConfirmationOutcome) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class ConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();
  private readonly ttlMs: number;

  constructor(@Optional() ttlMs?: number) {
    this.ttlMs = ttlMs ?? 60_000;
  }

  /**
   * 创建待确认项，返回 token 与可等待的决策 Promise。
   * TTL 超时后自动 resolve('timeout')，避免 pending promise 泄漏。
   */
  create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): { token: string; decision: Promise<ConfirmationOutcome> } {
    const token = randomUUID();
    let resolveFn!: (outcome: ConfirmationOutcome) => void;
    const decision = new Promise<ConfirmationOutcome>((resolve) => {
      resolveFn = resolve;
    });

    const timer = setTimeout(() => {
      const pending = this.pending.get(token);
      if (pending) {
        this.pending.delete(token);
        pending.resolve('timeout');
      }
    }, this.ttlMs);
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
   */
  resolve(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'reject',
  ): boolean {
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== requestUserId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending.delete(token);
    pending.resolve(decision === 'approve' ? 'approve' : 'decline');
    return true;
  }

  /** 当前待确认数量（测试/观测用） */
  get pendingCount(): number {
    return this.pending.size;
  }
}
