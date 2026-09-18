// SPDX-License-Identifier: Apache-2.0

import type { AiAuditLog } from './ai-audit-log.entity';

/** B3/E-2 按 UTC 日聚合的趋势桶（5 段：执行/批准/拒绝/阻断/错误） */
export interface AuditByDayBucket {
  date: string;
  executed: number;
  approved: number;
  rejected: number;
  blocked: number;
  errors: number;
}

/**
 * B3/E-2：按 UTC 日聚合 5 段趋势。
 *
 * **单源**：报表域（`getActionReport`）与统计域（`AuditStatsService`）共用同一份实现——
 * 这函数里藏着口径判断（「什么算 blocked、什么算 approved」），两侧各写一份的话分叉是迟早的事，
 * 而且分叉了没人会发现（两处都"看起来对"）。故在拆分统计域时先把它提出来当地基，而不是复制一份。
 */
export function byDayAggregation(logs: AiAuditLog[]): AuditByDayBucket[] {
  const byDay = new Map<string, AuditByDayBucket>();
  const bucket = (createdAt: Date): AuditByDayBucket => {
    const key = createdAt.toISOString().slice(0, 10);
    let b = byDay.get(key);
    if (!b) {
      b = { date: key, executed: 0, approved: 0, rejected: 0, blocked: 0, errors: 0 };
      byDay.set(key, b);
    }
    return b;
  };
  for (const l of logs) {
    const b = bucket(l.createdAt);
    if (l.isError) b.errors++;
    if (l.action === 'tool_call') {
      // blocked = 工具被拒（authorization 标记或 errorMessage 含拒绝标记）；执行失败无拒绝标记只算 error
      if (l.isError && (l.authorization || /blocked|denied|拒绝|越权|R5|禁用|禁止|无权/i.test(l.errorMessage ?? '')))
        b.blocked++;
      else if (!l.isError) b.executed++;
    } else if (l.action === 'tool_confirmation') {
      if (l.isError) b.rejected++;
      else if (!l.detail?.includes('pending_approval')) b.approved++;
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}
