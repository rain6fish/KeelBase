// SPDX-License-Identifier: Apache-2.0

/**
 * 平台观测域（阶段 3 第十四刀：从 `AdminService` 拆出）。
 *
 * 回答的是「**这套系统现在怎么样**」——监控摘要（健康 / 依赖 / 计数 / 指标）、运维摘要
 * （指标 + 依赖 + 近 24h 错误 → 派生告警 + 审计日趋势），以及它们背后的探针
 * （读 Prometheus 指标、探 Redis 连通）。**只观测、不改数据**。
 *
 * 与 `AdminService` 的分工：那个管「管理端对业务数据的查询与处置」（用户/事件/会话/回收站/广播/
 * 数据统计），本域管「运行时自身的状态」。存储用量探针（`_getStorageUsage`）**留在 AdminService**——
 * 它只被平台总览用，与本域无交集。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { probeRedisReachable } from '../common/utils/redis-probe';
import { queueStatus } from '../queue/queue-status';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Notification } from '../notifications/notification.entity';
import { UserSession } from '../auth/user-session.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { MetricsService } from '../metrics/metrics.service';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class AdminObservabilityService {
  private readonly logger = new Logger(AdminObservabilityService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(Notification) private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(UserSession) private readonly sessionsRepo: Repository<UserSession>,
    @InjectRepository(OperationAuditLog) private readonly opAuditRepo: Repository<OperationAuditLog>,
    @InjectRepository(AiAuditLog) private readonly aiAuditRepo: Repository<AiAuditLog>,
    @InjectRepository(AiConversation) private readonly convRepo: Repository<AiConversation>,
    @InjectRepository(KnowledgeArticle) private readonly knowledgeRepo: Repository<KnowledgeArticle>,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() @InjectQueue('push') private readonly pushQueue: Queue | null,
    // E-3 聚合端点缓存（admin 读全库 count，30s 短 TTL 自过期；未启用/不可用时直查库）
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  async getMonitorSummary() {
    const cached = await this.cacheService?.get<any>('admin:monitor');
    if (cached) return cached;
    const [users, events, notifications, sessions, opAudit, aiAudit, conversations, knowledge] = await Promise.all([
      this.usersRepo.count(),
      this.eventsRepo.count(),
      this.notificationsRepo.count(),
      this.sessionsRepo.count(),
      this.opAuditRepo.count(),
      this.aiAuditRepo.count(),
      this.convRepo.count(),
      this.knowledgeRepo.count(),
    ]);

    const uptime = process.uptime();
    const metrics = await this._readMetrics();
    const redis = await this._checkRedis();

    const result = {
      health: {
        status: 'ok',
        uptimeSec: Math.round(uptime),
        nodeEnv: this.configService.get<string>('NODE_ENV', 'development'),
        version: this.configService.get<string>('APP_VERSION', ''),
      },
      dependencies: {
        database: 'up',
        redis: redis ? 'up' : 'down',
        // 三态语义见 queue-status.ts —— disabled = 配置关闭，不是故障（同一次 Redis 探活派生）
        queue: queueStatus(!!this.pushQueue, redis ? 'up' : 'down'),
        storage: this.configService.get<string>('STORAGE_DRIVER', 'local'),
        mail: this.configService.get<boolean>('MAIL_ENABLED', false) ? 'configured' : 'disabled',
        push: this.configService.get<string>('PUSH_DRIVER', 'none'),
      },
      counts: {
        users,
        events,
        notifications,
        sessions,
        operationAuditLogs: opAudit,
        aiAuditLogs: aiAudit,
        conversations,
        knowledge,
      },
      metrics: {
        requestRateRps: metrics.requestRateRps,
        errorRatePct: metrics.errorRatePct,
        latencyP95Ms: metrics.latencyP95Ms,
        inFlight: metrics.inFlight,
      },
    };
    await this.cacheService?.set('admin:monitor', result, 30_000);
    return result;
  }

  private async _readMetrics() {
    try {
      const totalValues = (await this.metricsService.httpRequestsTotal.get()).values;
      const totalMetric = totalValues.reduce((a, v) => a + v.value, 0);
      const errorMetric = totalValues
        .filter((v) => String(v.labels.status ?? '').startsWith('5'))
        .reduce((a, v) => a + v.value, 0);
      const inFlight = (await this.metricsService.httpRequestsInFlight.get())
        .values.reduce((a, v) => a + v.value, 0);

      // p95 从 duration histogram 桶插值（桶 le 标签不在 MetricValue 类型中，断言读取）
      let latencyP95Ms: number | null = null;
      const buckets = (await this.metricsService.httpRequestDurationSeconds.get()).values;
      if (buckets.length > 0) {
        const leOf = (labels: Record<string, unknown>): string => String(labels['le'] ?? '');
        const total = buckets.find((b) => leOf(b.labels) === '+Inf')?.value ?? 0;
        if (total > 0) {
          const target = total * 0.95;
          let acc = 0;
          for (const b of buckets) {
            if (leOf(b.labels) === '+Inf') continue;
            acc += b.value;
            if (acc >= target) {
              latencyP95Ms = Math.round(Number(leOf(b.labels)) * 1000);
              break;
            }
          }
        }
      }

      const errorRatePct = totalMetric > 0 ? (errorMetric / totalMetric) * 100 : 0;
      return {
        requestRateRps: Math.round(totalMetric / 60 * 100) / 100,
        errorRatePct: Math.round(errorRatePct * 100) / 100,
        latencyP95Ms,
        inFlight: Math.round(inFlight),
      };
    } catch (err) {
      this.logger.warn(`[Admin] read metrics failed: ${(err as Error).message}`);
      return { requestRateRps: null, errorRatePct: null, latencyP95Ms: null, inFlight: null };
    }
  }

  private async _checkRedis(): Promise<boolean> {
    const redisUrl = this.configService.get<string>('REDIS_URL', '');
    if (!redisUrl) return false;
    // 未配置/不可达/URL 非法都算 down（探活实现与缓存降级共用一处）
    return (await probeRedisReachable(redisUrl)) === true;
  }

  async getOpsSummary() {
    const [metrics, redis, errors] = await Promise.all([
      this._readMetrics(),
      this._checkRedis(),
      this._recentErrors(),
    ]);
    const alerts = this._deriveAlerts(metrics, redis, errors);
    const trend = await this._getAuditTrend(7);
    return { alerts, metrics, logErrors: errors, trend };
  }

  /** 近 24h 错误摘要：操作审计 4xx/5xx 按状态码分组 + AI 审计 is_error 数。 */
  private async _recentErrors() {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const rows = await this.opAuditRepo
      .createQueryBuilder('log')
      .select('log.statusCode', 'code')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :since', { since })
      .andWhere('log.statusCode >= 400')
      .groupBy('log.statusCode')
      .getRawMany<{ code: string; count: string }>();
    const aiErrors = await this.aiAuditRepo.count({
      where: { isError: true, createdAt: MoreThanOrEqual(since) },
    });
    return {
      since,
      opErrors: rows.map((r) => ({ code: Number(r.code), count: Number(r.count) })),
      aiErrors,
    };
  }

  /** 派生告警：指标阈值 + 依赖状态 + 错误计数（Prometheus 规则的可视化降级）。 */
  private _deriveAlerts(
    metrics: { errorRatePct?: number | null },
    redis: boolean,
    errors: { opErrors: Array<{ code: number; count: number }>; aiErrors: number },
  ): Array<{ level: 'critical' | 'warning'; title: string; detail: string }> {
    const alerts: Array<{ level: 'critical' | 'warning'; title: string; detail: string }> = [];
    const errRate = metrics.errorRatePct ?? 0;
    if (errRate > 15) {
      alerts.push({ level: 'critical', title: '错误率过高', detail: `HTTP 错误率 ${errRate.toFixed(1)}% 超过 15% 阈值` });
    } else if (errRate > 5) {
      alerts.push({ level: 'warning', title: '错误率偏高', detail: `HTTP 错误率 ${errRate.toFixed(1)}% 超过 5% 阈值` });
    }
    if (!redis) {
      alerts.push({ level: 'critical', title: 'Redis 不可用', detail: '缓存与依赖中断，功能可能降级' });
    }
    if (errors.opErrors.length > 0) {
      const n = errors.opErrors.reduce((s, e) => s + e.count, 0);
      alerts.push({ level: 'warning', title: '近 24h 有 4xx/5xx', detail: `操作审计记录 ${n} 条错误响应` });
    }
    if (errors.aiErrors > 0) {
      alerts.push({ level: 'warning', title: 'AI 调用失败', detail: `近 24h ${errors.aiErrors} 次 AI 调用失败` });
    }
    return alerts;
  }

  /** 最近 N 天操作审计日趋势（操作数 + 错误数），无日志的天补 0。 */
  private async _getAuditTrend(days: number): Promise<Array<{ day: string; total: number; errors: number }>> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const isPg = this.dataSource.options?.type === 'postgres';
    const dayExpr = isPg ? "to_char(log.createdAt, 'YYYY-MM-DD')" : "strftime('%Y-%m-%d', log.createdAt)";
    const rows = await this.opAuditRepo
      .createQueryBuilder('log')
      .select(dayExpr, 'day')
      .addSelect('COUNT(*)', 'total')
      .addSelect("SUM(CASE WHEN log.statusCode >= 400 THEN 1 ELSE 0 END)", 'errors')
      .where('log.createdAt >= :since', { since })
      .groupBy(dayExpr)
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; total: string; errors: string | null }>();
    const map = new Map(rows.map((r) => [r.day, { total: Number(r.total), errors: Number(r.errors ?? 0) }]));
    const out: Array<{ day: string; total: number; errors: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      out.push({ day: key, ...(map.get(key) ?? { total: 0, errors: 0 }) });
    }
    return out;
  }
}
