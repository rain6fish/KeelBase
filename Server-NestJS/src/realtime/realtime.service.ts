// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

/**
 * WS 连接注册表：用户 → 在线 socket 集合，提供按用户下发与广播。
 * 单实例内存实现（与现有 SSE NotificationsGateway 一致）；多实例 Redis pub/sub 为二期。
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly connections = new Map<number, Set<WebSocket>>();

  register(userId: number, client: WebSocket): void {
    const set = this.connections.get(userId) ?? new Set<WebSocket>();
    set.add(client);
    this.connections.set(userId, set);
  }

  unregister(userId: number, client: WebSocket): void {
    const set = this.connections.get(userId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.connections.delete(userId);
  }

  emitToUser(userId: number, event: string, data: unknown): void {
    const set = this.connections.get(userId);
    if (!set) return;
    const payload = JSON.stringify({ event, data });
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch (err) {
          this.logger.debug(`ws send to user ${userId} failed: ${(err as Error).message}`);
        }
      }
    }
  }

  broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify({ event, data });
    for (const set of this.connections.values()) {
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(payload);
          } catch {
            /* 单条失败忽略 */
          }
        }
      }
    }
  }

  /** 心跳 sweep：上一轮 ping 未收到 pong 的连接 terminate；否则置 isAlive=false 并发 ping。由 gateway @Interval 周期调用 */
  sweep(): void {
    for (const set of this.connections.values()) {
      for (const ws of set) {
        const alive = (ws as { isAlive?: boolean }).isAlive;
        if (alive === false) {
          ws.terminate();
        } else {
          (ws as { isAlive?: boolean }).isAlive = false;
          try {
            ws.ping();
          } catch {
            /* 已关闭，忽略 */
          }
        }
      }
    }
  }
}
