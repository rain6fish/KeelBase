// SPDX-License-Identifier: Apache-2.0

import { createConnection } from 'node:net';

/**
 * 探测 Redis 端口是否可达（纯 TCP，不建 Redis 客户端——探测本身不能留下重连循环）。
 *
 * 用于在拉起 Redis 客户端之前判定「Redis 是否可用」。零配置启动时 `REDIS_URL` 有默认值
 * （`redis://localhost:6379`）、`CACHE_ENABLED` 默认开，若仍创建 node-redis 客户端，它会在
 * 后台无限重连并持续打印 ECONNREFUSED 栈（2026-09-22 实测 ~4 条/秒，服务本身照常监听）。
 *
 * @returns `true` 端口有监听；`false` 明确不可达；`null` URL 无法解析（未知，由调用方决定处置）
 */
export function probeRedisReachable(url: string, timeoutMs = 1500): Promise<boolean | null> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      resolve(null);
      return;
    }
    const socket = createConnection({ host: target.hostname || 'localhost', port: Number(target.port || 6379) });
    let settled = false;
    const settle = (reachable: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    // error 监听保持常驻（不随 settle 摘除）：destroy 之后仍可能有迟到的 error 事件，无监听即抛出
    socket.on('error', () => settle(false));
    socket.once('connect', () => settle(true));
    socket.setTimeout(timeoutMs, () => settle(false));
  });
}
