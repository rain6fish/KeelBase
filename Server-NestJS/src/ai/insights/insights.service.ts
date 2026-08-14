import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { Event } from '../../events/event.entity';
import { withSpan } from '../../common/tracing/tracer';

export interface InsightsStats {
  totalEvents: number;
  activeEvents: number;
  cancelledEvents: number;
  recentEvents: number;
  earliestEventAt?: string;
  latestEventAt?: string;
  monthlyBreakdown: Array<{ month: string; count: number }>;
}

export interface InsightsResult {
  stats: InsightsStats;
  summary: string;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private readonly eventsService: EventsService) {}

  /**
   * 生成用户数据洞察报告（确定性聚合 + 可选 LLM 摘要）。
   */
  async generateInsights(userId: number, days = 30): Promise<InsightsResult> {
    return withSpan('ai.insights', async () => {
      return this.generateInsightsImpl(userId, days);
    }, { 'ai.user_id': userId, 'ai.days': days });
  }

  private async generateInsightsImpl(userId: number, days = 30): Promise<InsightsResult> {
    const events = await this.eventsService.getEventsForRange(
      '2000-01-01',
      '2099-12-31',
      userId,
    );

    const stats = this._buildStats(events, days);
    const summary = this._buildSummary(stats);

    return { stats, summary };
  }

  private _buildStats(events: Event[], days: number): InsightsStats {
    const now = Date.now();
    const recentCutoff = new Date(now - days * 24 * 60 * 60 * 1000);

    const monthly = new Map<string, number>();
    let recentEvents = 0;
    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const e of events) {
      // 每月分布
      const month = `${e.startTime.getFullYear()}-${String(e.startTime.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(month, (monthly.get(month) ?? 0) + 1);

      // 近 N 天
      if (e.startTime >= recentCutoff) recentEvents++;

      // 最早/最近
      if (!earliest || e.startTime < earliest) earliest = e.startTime;
      if (!latest || e.startTime > latest) latest = e.startTime;
    }

    const monthlyBreakdown = Array.from(monthly.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const cancelled = events.filter((e) => e.isCancelled).length;

    return {
      totalEvents: events.length,
      activeEvents: events.length - cancelled,
      cancelledEvents: cancelled,
      recentEvents,
      earliestEventAt: earliest?.toISOString(),
      latestEventAt: latest?.toISOString(),
      monthlyBreakdown,
    };
  }

  private _buildSummary(stats: InsightsStats): string {
    if (stats.totalEvents === 0) {
      return '你还没有任何事件，创建一些事件来开始管理你的日程吧。';
    }
    const activeRate = Math.round(
      (stats.activeEvents / stats.totalEvents) * 100,
    );
    const topMonth = stats.monthlyBreakdown.reduce(
      (max, m) => (m.count > max.count ? m : max),
      stats.monthlyBreakdown[0],
    );
    return `你共有 ${stats.totalEvents} 个事件，其中 ${stats.activeEvents} 个进行中（${activeRate}%）。最活跃的月份是 ${
      topMonth?.month ?? '—'
    }（${topMonth?.count ?? 0} 个）。`;
  }
}
