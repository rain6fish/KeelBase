// SPDX-License-Identifier: Apache-2.0

/**
 * 审计聚合统计（从 `AuditService` 拆出的第一个领域，健康清单 §3 阶段 3）。
 *
 * 拆它的理由不是「类太大」本身，而是这几件事与**写入路径**毫无关系：它们只读日志、只做内存聚合，
 * 却被塞在同一个类里，于是任何一次写审计的改动都要在一个 1300 行的文件里找落点。
 * 拆开后写入（`AuditService.log` + 哈希链）与聚合（本类）各管各的。
 *
 * **行为与本类拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { CacheService } from '../../common/cache/cache.service';
import { AuditByDayBucket, byDayAggregation } from './by-day';

/** B3 用量统计（原始 token 量，不做计费换算） */
export interface UsageStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalErrors: number;
  topActions: Array<{ action: string; count: number }>;
  /** E-2 趋势：按 UTC 日聚 5 段（executed/approved/rejected/blocked/errors） */
  byDay: AuditByDayBucket[];
}

@Injectable()
export class AuditStatsService {
  constructor(
    @InjectRepository(AiAuditLog) private readonly logRepo: Repository<AiAuditLog>,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /** 单用户用量统计。 */
  async getStats(userId: string, since?: Date): Promise<UsageStats> {
    const where: any = { userId };
    if (since) where.createdAt = Between(since, new Date());

    const logs = await this.logRepo.find({ where });

    const actionCounts = new Map<string, number>();
    let totalTokens = 0;
    let totalErrors = 0;

    for (const log of logs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
      totalTokens += (log.promptTokens ?? 0) + (log.completionTokens ?? 0);
      if (log.isError) totalErrors++;
    }

    return {
      totalConversations: actionCounts.get('chat') ?? 0,
      totalMessages: logs.length,
      totalTokens,
      totalErrors,
      topActions: Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byDay: byDayAggregation(logs),
    };
  }

  /** 全局用量统计（管理台）。 */
  async getAllStats(since?: Date): Promise<UsageStats> {
    const sinceDay = since ? since.toISOString().slice(0, 10) : 'all';
    const cached = await this.cacheService?.get<UsageStats>(`audit:stats:${sinceDay}`);
    if (cached) return cached;
    const where: any = {};
    if (since) where.createdAt = Between(since, new Date());

    // E-3 性能：列投影——只加载聚合所需列（action/tokens/isError/createdAt），避免大字段（detail/model）全量载内存
    const logs = await this.logRepo.find({
      where,
      select: {
        action: true,
        promptTokens: true,
        completionTokens: true,
        isError: true,
        createdAt: true,
        detail: true,
        authorization: true,
        errorMessage: true,
      },
    });

    const actionCounts = new Map<string, number>();
    let totalTokens = 0;
    let totalErrors = 0;

    for (const log of logs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
      totalTokens += (log.promptTokens ?? 0) + (log.completionTokens ?? 0);
      if (log.isError) totalErrors++;
    }

    const result = {
      totalConversations: actionCounts.get('chat') ?? 0,
      totalMessages: logs.length,
      totalTokens,
      totalErrors,
      topActions: Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byDay: byDayAggregation(logs),
    };
    await this.cacheService?.set(`audit:stats:${sinceDay}`, result, 60_000);
    return result;
  }

  /** AI-21 成本看板：按 模型 / 意图 / 用户 聚合 tokens（跳过错误行）。 */
  async getCostBreakdown(since?: Date) {
    const sinceDay = since ? since.toISOString().slice(0, 10) : 'all';
    const cached = await this.cacheService?.get<any>(`audit:cost:${sinceDay}`);
    if (cached) return cached;
    const where: any = {};
    if (since) where.createdAt = Between(since, new Date());

    const logs = await this.logRepo.find({ where });

    const byModel = new Map<string, { calls: number; promptTokens: number; completionTokens: number }>();
    const byIntent = new Map<string, number>();
    const byUser = new Map<string, { calls: number; tokens: number }>();
    let totalCalls = 0;
    let totalTokens = 0;

    for (const log of logs) {
      if (log.isError) continue;
      totalCalls++;
      const pt = log.promptTokens ?? 0;
      const ct = log.completionTokens ?? 0;
      const tokens = pt + ct;
      totalTokens += tokens;

      const model = log.model ?? 'unknown';
      const m = byModel.get(model) ?? { calls: 0, promptTokens: 0, completionTokens: 0 };
      m.calls++;
      m.promptTokens += pt;
      m.completionTokens += ct;
      byModel.set(model, m);

      byIntent.set(log.action, (byIntent.get(log.action) ?? 0) + 1);

      const u = byUser.get(log.userId) ?? { calls: 0, tokens: 0 };
      u.calls++;
      u.tokens += tokens;
      byUser.set(log.userId, u);
    }

    const result = {
      summary: { totalCalls, totalTokens, since: since?.toISOString() ?? null },
      byModel: Array.from(byModel.entries())
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.promptTokens + b.completionTokens - (a.promptTokens + a.completionTokens)),
      byIntent: Array.from(byIntent.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byUser: Array.from(byUser.entries())
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.tokens - a.tokens),
    };
    await this.cacheService?.set(`audit:cost:${sinceDay}`, result, 60_000);
    return result;
  }
}
