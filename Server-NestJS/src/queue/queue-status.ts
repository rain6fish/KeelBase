// SPDX-License-Identifier: Apache-2.0

import { isQueueEnabled } from './queue.module';

/**
 * 异步队列的**如实**状态——`/health?detail=true` 与 `/admin/monitor/summary` 共用这一处判断。
 *
 * 用三态而非两态，因为「关闭」与「故障」是两件事：
 * - `disabled`：`QUEUE_ENABLED=false`（默认）——**配置选择，不是故障**；队列相关能力随之降级
 *   （事件提醒不触发，启动时会告警）。
 * - `up` / `down`：已启用时按 **Redis 可达性**判定。BullMQ 的连接是惰性的、Queue 对象存在
 *   **不等于**可用，故不能拿「注入了 Queue」当 up —— 否则一个 Redis 已挂的部署会显示队列正常。
 */
export function queueStatus(hasQueue: boolean, redisStatus: string): 'up' | 'down' | 'disabled' {
  if (!isQueueEnabled()) return 'disabled';
  if (!hasQueue) return 'down';
  return redisStatus === 'up' ? 'up' : 'down';
}
