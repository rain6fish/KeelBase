/**
 * AI 审计日志服务
 *
 * 记录所有 AI 交互：对话、工具调用、错误等。
 * 数据持久化到 ai_audit_logs 表，支持后续的用量分析和安全审计。
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import {
  AuditChainService,
  ChainVerification,
} from '../../common/audit-chain/audit-chain.service';

export interface AuditEntry {
  userId: string;
  conversationId?: string;
  action: 'chat' | 'tool_call' | 'navigate' | 'error' | 'login' | 'plan' | 'analyze' | 'knowledge' | 'delegate' | 'tool_confirmation' | 'flow_node';
  detail?: string;
  model?: string;
  provider?: string;
  /** W4-⑤ Agent Identity：调用方 agent 标识（headless key id / 子 agent） */
  agentId?: string;
  /** W4-⑤ 会话标识（access token 暂无 jti，接入前可空） */
  sessionId?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  isError?: boolean;
  errorMessage?: string;
}

export interface UsageStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalErrors: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface AiAuditLogWithUser {
  id: number;
  userId: string;
  conversationId?: string | null;
  action: string;
  detail?: string | null;
  model?: string | null;
  provider?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  isError: boolean;
  errorMessage?: string | null;
  createdAt: string;
  username?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AiAuditLog)
    private readonly logRepo: Repository<AiAuditLog>,
    @InjectRepository(AiDailyUsage)
    private readonly usageRepo: Repository<AiDailyUsage>,
    private readonly auditChain: AuditChainService,
  ) {}

  /** 审计写串行队列：保证「读 lastHash → 计算 hash → 插入」原子化，杜绝并发写链分叉（合成陌生人实测发现 brokenIndex:30） */
  private _tail: Promise<unknown> = Promise.resolve();

  async log(entry: AuditEntry): Promise<void> {
    // 链式串行：每次 log 排队在前一次之后执行，避免两个并发写同时读到同一 lastHash 造成分叉
    const job = this._tail.then(async () => {
      const prevHash = await this._lastHash();
      const hash = this.auditChain.computeHash(
        prevHash,
        this._payload({
          userId: entry.userId,
          conversationId: entry.conversationId,
          action: entry.action,
          detail: entry.detail ? entry.detail.slice(0, 2000) : null,
          model: entry.model,
          provider: entry.provider,
          promptTokens: entry.promptTokens,
          completionTokens: entry.completionTokens,
          durationMs: entry.durationMs,
          isError: entry.isError ?? false,
          errorMessage: entry.errorMessage,
        }),
      );
      await this.logRepo.save({
        userId: entry.userId,
        conversationId: entry.conversationId,
        action: entry.action,
        detail: entry.detail ? entry.detail.slice(0, 2000) : undefined,
        model: entry.model,
        provider: entry.provider,
        agentId: entry.agentId,
        sessionId: entry.sessionId,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        durationMs: entry.durationMs,
        isError: entry.isError ?? false,
        errorMessage: entry.errorMessage,
        prevHash,
        hash,
      });
    });
    // 串行链：失败不阻断后续写，但保持顺序
    this._tail = job.catch(() => {});
    await job;
  }

  /** HS-11：沿 id 升序校验审计哈希链完整性。 */
  async verifyChain(): Promise<ChainVerification> {
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    return this.auditChain.verifyChain(rows, (row) => this._payload(row));
  }

  private async _lastHash(): Promise<string | null> {
    const row = await this.logRepo
      .createQueryBuilder('log')
      .select('log.hash', 'hash')
      .orderBy('log.id', 'DESC')
      .limit(1)
      .getRawOne<{ hash: string }>();
    return row?.hash ?? null;
  }

  /** 链 payload 的规范形态：写入与校验共用，保证两端一致。 */
  private _payload(row: object): Record<string, unknown> {
    const r = row as Record<string, unknown>;
    return {
      userId: r.userId ?? null,
      conversationId: r.conversationId ?? null,
      action: r.action ?? null,
      detail: r.detail ?? null,
      model: r.model ?? null,
      provider: r.provider ?? null,
      promptTokens: r.promptTokens ?? null,
      completionTokens: r.completionTokens ?? null,
      durationMs: r.durationMs ?? null,
      isError: r.isError ?? false,
      errorMessage: r.errorMessage ?? null,
      feedback: r.feedback ?? null,
      feedbackNote: r.feedbackNote ?? null,
    };
  }

  async getUserLogs(
    userId: string,
    options: { limit?: number; offset?: number; since?: Date } = {},
  ): Promise<AiAuditLogWithUser[]> {
    return this._queryLogs({ userId, ...options });
  }

  async getLogs(
    options: { limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number } = {},
  ): Promise<AiAuditLogWithUser[]> {
    return this._queryLogs(options);
  }

  /**
   * AI-18 对话反馈：用户对某次对话点赞/点踩（+可选原因）。
   * 反馈落在这条对话最近一条非错误审计日志上。
   */
  async submitFeedback(
    userId: string,
    conversationId: string,
    feedback: 'thumbs_up' | 'thumbs_down',
    note?: string,
  ): Promise<{ updated: boolean }> {
    const log = await this.logRepo
      .createQueryBuilder('log')
      .where('log.userId = :userId', { userId })
      .andWhere('log.conversationId = :conversationId', { conversationId })
      .andWhere('log.isError = :err', { err: false })
      .orderBy('log.createdAt', 'DESC')
      .getOne();

    if (!log) return { updated: false };
    await this.logRepo.update(log.id, { feedback, feedbackNote: note ?? undefined });
    return { updated: true };
  }

  /** 查询审计日志并左联用户表带出 username（原则 3：审计显示用户名）。userId 存的是数字字符串，需 CAST。ORG-5 支持按组织维度过滤。 */
  private async _queryLogs(
    options: { userId?: string; limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number } = {},
  ): Promise<AiAuditLogWithUser[]> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      .leftJoin('users', 'u', 'CAST(log.userId AS INTEGER) = u.id')
      .addSelect('u.username', 'username')
      .orderBy('log.createdAt', 'DESC')
      .take(options.limit ?? 50)
      .skip(options.offset ?? 0);
    if (options.userId) qb.where('log.userId = :userId', { userId: options.userId });
    if (options.since) qb.andWhere('log.createdAt >= :since', { since: options.since });
    if (options.feedback) qb.andWhere('log.feedback = :feedback', { feedback: options.feedback });
    if (options.orgId != null) {
      qb.andWhere(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :orgId)',
        { orgId: options.orgId },
      );
    }

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: Number(r.log_id),
      userId: String(r.log_user_id),
      conversationId: r.log_conversation_id ?? null,
      action: r.log_action,
      detail: r.log_detail ?? null,
      model: r.log_model ?? null,
      provider: r.log_provider ?? null,
      promptTokens: r.log_prompt_tokens != null ? Number(r.log_prompt_tokens) : null,
      completionTokens: r.log_completion_tokens != null ? Number(r.log_completion_tokens) : null,
      durationMs: r.log_duration_ms != null ? Number(r.log_duration_ms) : null,
      isError: Boolean(r.log_is_error),
      errorMessage: r.log_error_message ?? null,
      feedback: r.log_feedback ?? null,
      feedbackNote: r.log_feedback_note ?? null,
      createdAt: String(r.log_createdAt),
      username: r.username ?? null,
    }));
  }

  /**
   * RG-2.1：统计用户今日非错误 AI 调用次数（限额校验用）。
   * A2：改读独立计数表 ai_daily_usage，不再依赖 ai_audit_logs——
   * HS-9 审计粒度 'off'/'write' 只关审计日志，不能关掉每日限额。
   */
  async countChatsToday(userId: string): Promise<number> {
    const usageDate = this._todayKey();
    const row = await this.usageRepo.findOne({ where: { userId, usageDate } });
    return row?.count ?? 0;
  }

  /**
   * A2：成功（非错误）AI 对话完成时自增当日用量，独立于审计粒度写入。
   */
  async incrementDailyUsage(userId: string): Promise<void> {
    const usageDate = this._todayKey();
    const existing = await this.usageRepo.findOne({ where: { userId, usageDate } });
    if (existing) {
      existing.count += 1;
      await this.usageRepo.save(existing);
    } else {
      try {
        await this.usageRepo.save(
          this.usageRepo.create({ userId, usageDate, count: 1 }),
        );
      } catch {
        // 并发首写冲突：唯一约束兜底，改走自增路径
        const row = await this.usageRepo.findOne({ where: { userId, usageDate } });
        if (row) {
          row.count += 1;
          await this.usageRepo.save(row);
        }
      }
    }
  }

  private _todayKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

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
    };
  }

  /**
   * AI-21 成本看板：按 用户×模型×意图 聚合 tokens（复用 ai_audit_logs）。
   * 不含 error 日志；token 计费近似（prompt 单价低于 completion，此处给出原始量）。
   */
  async getCostBreakdown(since?: Date) {
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

    return {
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
  }

  async getAllStats(since?: Date): Promise<UsageStats> {
    const where: any = {};
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
    };
  }
}
