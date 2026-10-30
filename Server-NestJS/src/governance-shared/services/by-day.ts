// SPDX-License-Identifier: Apache-2.0

import type { AiAuditLog } from '../../governance-shared/entities/ai-audit-log.entity';
import { resolveOutcome } from './audit-outcome';

/** B3/E-2 按 UTC 日聚合的趋势桶（6 段：执行/批准/拒绝/阻断/被治理拒绝/错误） */
export interface AuditByDayBucket {
  date: string;
  executed: number;
  approved: number;
  rejected: number;
  blocked: number;
  refused: number;
  errors: number;
}

/**
 * B3/E-2: UTC-day buckets over six segments.
 *
 * One implementation serves both the report (`getActionReport`) and the statistics domain
 * (`AuditStatsService`). The counting rules live here, and a second copy would drift while both copies
 * still looked right.
 *
 * **Reads the column, not the prose**: every segment comes from the outcome word `resolveOutcome`
 * decides (the column first, derivation for older rows). This used to read `isError` plus a regex over
 * `errorMessage`, while `summary` in the same response already read the `outcome` column — so the two
 * halves of one payload disagreed about the same row: a governance refusal was blocked here and merely
 * an error there, and a confirmation timeout went the other way. One payload may not hold two readings.
 *
 * B3/E-2：按 UTC 日聚合六段趋势。
 *
 * 报表域（`getActionReport`）与统计域（`AuditStatsService`）共用同一份实现 —— 口径判断住在这里，
 * 抄第二份的话两边会漂开，而两边都「看起来对」。
 *
 * **读列，不读散文**：分段一律由 `resolveOutcome` 决定的结局词产生（列优先，历史行回落到推导）。
 * 这里此前读 `isError` 加 `errorMessage` 正则，而同一份响应里的 `summary` 早已改读 `outcome` 列 ——
 * 于是两半对同一行给出不同的答案：一次治理拒绝在 `byDay` 里是 blocked、在 `summary` 里只算 error，
 * 一次确认超时反过来。同一份载荷不许有两种口径。
 */
export function byDayAggregation(logs: AiAuditLog[]): AuditByDayBucket[] {
  const byDay = new Map<string, AuditByDayBucket>();
  const bucket = (createdAt: Date): AuditByDayBucket => {
    const key = createdAt.toISOString().slice(0, 10);
    let b = byDay.get(key);
    if (!b) {
      b = { date: key, executed: 0, approved: 0, rejected: 0, blocked: 0, refused: 0, errors: 0 };
      byDay.set(key, b);
    }
    return b;
  };
  for (const l of logs) {
    const b = bucket(l.createdAt);
    if (l.isError) b.errors++;
    const outcome = resolveOutcome(l);
    if (l.action === 'tool_call') {
      if (outcome === 'executed') b.executed++;
      else if (outcome === 'blocked') b.blocked++;
      else if (outcome === 'refused') b.refused++;
    } else if (l.action === 'tool_confirmation') {
      // `pending`（R4 转人工审批）与 `timeout` 既非批准也非拒绝，一桶都不入。
      if (outcome === 'approved') b.approved++;
      else if (outcome === 'declined') b.rejected++;
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}
