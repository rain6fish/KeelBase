// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

export interface NotificationEventPayload {
  id: number;
  title: string;
  body?: string;
  type: string;
  targetType?: string | null;
  targetId?: string | null;
  createdAt?: Date;
}

/**
 * 通知实时推送（SSE）。维护每个在线用户的活跃连接，create 后主动推送。
 * 单服务内存实现；多实例部署需改用 Redis pub/sub（roadmap 后续）。
 */
@Injectable()
export class NotificationsGateway {
  private readonly connections = new Map<number, Set<Response>>();

  /** 注册一个用户的新 SSE 连接，返回取消订阅函数 */
  subscribe(userId: number, response: Response): () => void {
    let set = this.connections.get(userId);
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    set.add(response);

    // 客户端断开时清理
    response.on('close', () => {
      set.delete(response);
      if (set.size === 0) {
        this.connections.delete(userId);
      }
    });

    return () => {
      set.delete(response);
      if (set.size === 0) {
        this.connections.delete(userId);
      }
    };
  }

  /** 向某用户的所有在线连接推送通知 */
  emitToUser(userId: number, payload: NotificationEventPayload): void {
    const set = this.connections.get(userId);
    if (!set || set.size === 0) return;
    const data = JSON.stringify(payload);
    for (const res of set) {
      if (res.writableEnded) continue;
      try {
        res.write(`event: notification\n`);
        res.write(`data: ${data}\n\n`);
      } catch {
        // 写入失败忽略，连接会在 close 时清理
      }
    }
  }
}
