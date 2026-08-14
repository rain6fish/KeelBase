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

  constructor(@Optional() ttlMs?: number) {
    this.ttlMs = ttlMs ?? 60_000;
  }

  /**
   * 创建待确认项，返回 token 与可等待的决策 Promise。
   * TTL 超时后自动 resolve('timeout')，避免 pending promise 泄漏。
   * @param ttlMs 覆盖默认 TTL（HS-6：经 Settings 可配，如 confirmation_ttl_seconds）
   */
  create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    ttlMs?: number,
  ): { token: string; decision: Promise<ConfirmationResolveResult> } {
    const token = randomUUID();
    let resolveFn!: (result: ConfirmationResolveResult) => void;
    const decision = new Promise<ConfirmationResolveResult>((resolve) => {
      resolveFn = resolve;
    });

    const timer = setTimeout(() => {
      const pending = this.pending.get(token);
      if (pending) {
        this.pending.delete(token);
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
   * HS-6：trustTool 为 true 时，后续同工具写操作本会话免确认。
   */
  resolve(
    token: string,
    requestUserId: string,
    decision: 'approve' | 'reject',
    trustTool?: boolean,
  ): boolean {
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== requestUserId) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending.delete(token);
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
