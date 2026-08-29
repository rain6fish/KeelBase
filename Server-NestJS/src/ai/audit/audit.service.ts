/**
 * AI 审计日志服务
 *
 * 记录所有 AI 交互：对话、工具调用、错误等。
 * 数据持久化到 ai_audit_logs 表，支持后续的用量分析和安全审计。
 */

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository, Between, LessThan, MoreThan } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { actorContext } from '../actor-context';
import {
  AuditChainService,
  ChainVerification,
} from '../../common/audit-chain/audit-chain.service';
import { aiActionLabel } from './ai-feature-map';

export interface AuditEntry {
  userId: string;
  /** D2-1c username 快照：写审计时快照用户名（独立治理库后查询无需左联 users） */
  username?: string;
  conversationId?: string;
  action: 'chat' | 'tool_call' | 'navigate' | 'error' | 'login' | 'plan' | 'analyze' | 'knowledge' | 'delegate' | 'tool_confirmation' | 'flow_node';
  detail?: string;
  model?: string;
  provider?: string;
  /** W4-⑤ Agent Identity：调用方 agent 标识（headless key id / 子 agent） */
  agentId?: string;
  /** W4-⑤ 会话标识（access token 暂无 jti，接入前可空） */
  sessionId?: string;
  /** D4 Agent Delegation Chain（多 Agent 归责最小必需）：调用链父动作 id / 上层 agent / 委托上下文 / 业务意图 / 来源通道 */
  parentActionId?: string;
  callerAgentId?: string;
  delegationContext?: string;
  businessIntent?: string;
  source?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  isError?: boolean;
  errorMessage?: string;
  /** W5-⑦ Explainable Authz：工具被拒时 AuthorizationDeniedError.reasons 的 JSON（checks[]） */
  authorization?: string;
}

export interface UsageStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalErrors: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface ActionReport {
  period: { since: string | null; to: string };
  summary: {
    executed: number; // 工具执行（含写）
    approved: number; // 写操作人工批准
    rejected: number; // 写操作人工拒绝/超时
    blocked: number; // 工具被拒（治理/越权/R5）
    errors: number; // 全部 error
    effects: number; // 可撤销副作用记录数
  };
  byAction: Array<{ action: string; count: number }>;
  /** B3 时间趋势：按 UTC 日聚合执行/批准/拒绝/阻断/错误（升序），合规报告可看趋势 */
  byDay: Array<{ date: string; executed: number; approved: number; rejected: number; blocked: number; errors: number }>;
  hashChain: { valid: boolean; checked: number; brokenIndex: number | null };
  samples: Array<{
    id: number;
    action: string;
    toolName: string | null;
    isError: boolean;
    errorMessage?: string | null;
    createdAt: Date;
  }>;
}

export interface AiAuditLogWithUser {
  id: number;
  userId: string;
  conversationId?: string | null;
  action: string;
  detail?: string | null;
  /** D2 人类语言审计标签：语义 key（前端 i18n）+ 兜底人类可读描述（含工具名） */
  actionKey?: string | null;
  actionLabel?: string | null;
  /** W4-⑤ Agent Identity：调用方 agent（headless key id / 子 agent），Agent Registry name 归责于此 */
  agentId?: string | null;
  /** D4 Agent Delegation Chain 增量字段（多 Agent 归责） */
  parentActionId?: string | null;
  callerAgentId?: string | null;
  delegationContext?: string | null;
  businessIntent?: string | null;
  source?: string | null;
  model?: string | null;
  provider?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  isError: boolean;
  errorMessage?: string | null;
  authorization?: string | null;
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
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly auditChain: AuditChainService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 审计写串行队列：sqlite（单写者，better-sqlite3 单连接不支持多 QueryRunner 并发事务）用进程内串行；postgres 用 DB 级串行锁（roadmap §22.10 B） */
  private _tail: Promise<unknown> = Promise.resolve();

  async log(entry: AuditEntry): Promise<void> {
    // Agent Identity（评审二 §5）：从请求级 ActorContext 读 sessionId/agentId（entry 显式传值优先）
    const actor = actorContext.getStore();
    const sessionId = entry.sessionId ?? actor?.sessionId;
    const agentId = entry.agentId ?? actor?.agentId;
    // D2-1c username 快照：entry 显式传值优先，fallback 请求级 actor 上下文（JWT username）
    const username = entry.username ?? actor?.username;
    // D4 多 Agent 归责：callerAgentId/businessIntent 从 ActorContext fallback（子 agent 场景自动填充）
    const callerAgentId = entry.callerAgentId ?? actor?.callerAgentId;
    const businessIntent = entry.businessIntent ?? actor?.businessIntent;

    // 共享 payload（hash 计算与保存两端一致）
    const payload = this._payload({
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
      authorization: entry.authorization,
    });
    const entity = {
      userId: entry.userId,
      username,
      conversationId: entry.conversationId,
      action: entry.action,
      detail: entry.detail ? entry.detail.slice(0, 2000) : undefined,
      model: entry.model,
      provider: entry.provider,
      agentId,
      sessionId,
      parentActionId: entry.parentActionId,
      callerAgentId,
      delegationContext: entry.delegationContext,
      businessIntent,
      source: entry.source,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      durationMs: entry.durationMs,
      isError: entry.isError ?? false,
      errorMessage: entry.errorMessage,
      authorization: entry.authorization,
    };

    if (this.dataSource.options.type === 'postgres') {
      // DB 级串行（roadmap §22.10 B）：事务内锁 audit_chain_lock id=1（SELECT FOR UPDATE），
      // 跨实例串行化「读 lastHash → 计算 → 插入」——多副本不再分叉。
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query('SELECT id FROM "audit_chain_lock" WHERE id = 1 FOR UPDATE');
        const prevHash = await this._lastHash(runner);
        const hash = this.auditChain.computeHash(prevHash, payload);
        await runner.manager.save(AiAuditLog, { ...entity, prevHash, hash });
        await runner.commitTransaction();
      } catch (err) {
        await runner.rollbackTransaction().catch(() => {});
        throw err;
      } finally {
        await runner.release();
      }
    } else {
      // sqlite：进程内串行（better-sqlite3 单连接，多 QueryRunner 并发事务不支持；sqlite 单写者）
      const job = this._tail.then(async () => {
        const prevHash = await this._lastHash();
        const hash = this.auditChain.computeHash(prevHash, payload);
        await this.logRepo.save({ ...entity, prevHash, hash });
      });
      this._tail = job.catch(() => {});
      await job;
    }
  }

  /** HS-11：沿 id 升序校验审计哈希链完整性。 */
  async verifyChain(): Promise<ChainVerification> {
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    return this.auditChain.verifyChain(rows, (row) => this._payload(row));
  }

  private async _lastHash(runner?: QueryRunner): Promise<string | null> {
    if (runner) {
      // DB 级串行：在锁事务内读（与插入同事务，跨实例原子）
      const rows = await runner.query('SELECT hash FROM "ai_audit_logs" ORDER BY id DESC LIMIT 1');
      return rows?.[0]?.hash ?? null;
    }
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
      authorization: r.authorization ?? null,
      // feedback/feedbackNote 是链外注解列（submitFeedback 后置更新且不重算 hash）：
      // 写入与校验两侧恒置 null，保证 canonical payload 一致，防止反馈写入断链（HS-11）
      feedback: null,
      feedbackNote: null,
    };
  }

  async getUserLogs(
    userId: string,
    options: { limit?: number; offset?: number; since?: Date } = {},
  ): Promise<AiAuditLogWithUser[]> {
    return this._queryLogs({ userId, ...options });
  }

  async getLogs(
    options: { limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string } = {},
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
    options: { userId?: string; limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string } = {},
  ): Promise<AiAuditLogWithUser[]> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      // D2-1c username 快照：读快照列，不再左联业务 users 表（独立治理库后无 users）
      .addSelect('log.username', 'username')
      .orderBy('log.createdAt', 'DESC')
      .take(options.limit ?? 50)
      .skip(options.offset ?? 0);
    if (options.userId) qb.where('log.userId = :userId', { userId: options.userId });
    if (options.since) qb.andWhere('log.createdAt >= :since', { since: options.since });
    if (options.feedback) qb.andWhere('log.feedback = :feedback', { feedback: options.feedback });
    if (options.agentId) qb.andWhere('log.agent_id = :agentId', { agentId: options.agentId });
    if (options.orgId != null) {
      qb.andWhere(
        'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :orgId)',
        { orgId: options.orgId },
      );
    }

    const rows = await qb.getRawMany();
    return rows.map((r) => {
      const label = aiActionLabel(r.log_action, r.log_detail);
      return {
      id: Number(r.log_id),
      userId: String(r.log_user_id),
      conversationId: r.log_conversation_id ?? null,
      action: r.log_action,
      detail: r.log_detail ?? null,
      actionKey: label.key,
      actionLabel: label.fallback,
      agentId: r.log_agent_id ?? null,
      parentActionId: r.log_parent_action_id ?? null,
      callerAgentId: r.log_caller_agent_id ?? null,
      delegationContext: r.log_delegation_context ?? null,
      businessIntent: r.log_business_intent ?? null,
      source: r.log_source ?? null,
      model: r.log_model ?? null,
      provider: r.log_provider ?? null,
      promptTokens: r.log_prompt_tokens != null ? Number(r.log_prompt_tokens) : null,
      completionTokens: r.log_completion_tokens != null ? Number(r.log_completion_tokens) : null,
      durationMs: r.log_duration_ms != null ? Number(r.log_duration_ms) : null,
      isError: Boolean(r.log_is_error),
      errorMessage: r.log_error_message ?? null,
      authorization: r.log_authorization ?? null,
      feedback: r.log_feedback ?? null,
      feedbackNote: r.log_feedback_note ?? null,
      createdAt: String(r.log_createdAt),
      username: r.username ?? null,
    };
    });
  }

  /**
   * RG-2.1 原子预留：AI 每日限额（ai_daily_limit）并发下不超限。
   * 用原子条件 UPDATE（where count < limit）替代「读-判-写」，与 headless 配额同模式——
   * 并发请求同时读到同一 used 集体越限的问题由此消除。
   * 返回 true=预留成功（本次对话已计入限额）；false=已达限额。首写行不存在时先建 count=0。
   */
  async reserveDailyUsage(userId: string, limit: number): Promise<boolean> {
    const usageDate = this._todayKey();
    try {
      await this.usageRepo.save(this.usageRepo.create({ userId, usageDate, count: 0 }));
    } catch {
      // 行已存在（含并发首写唯一约束冲突）——忽略，走原子条件递增
    }
    const criteria: any = { userId, usageDate };
    if (limit > 0) criteria.count = LessThan(limit);
    const res = await this.usageRepo.update(criteria, { count: () => 'count + 1' });
    return res.affected === 1;
  }

  /** 对话错误/失败时释放预留槽（保底：count>0 才递减，防负值）。 */
  async releaseDailyUsage(userId: string): Promise<void> {
    const usageDate = this._todayKey();
    await this.usageRepo.update(
      { userId, usageDate, count: MoreThan(0) },
      { count: () => 'count - 1' },
    );
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
   * §10 P1 AI Action Report：合规证据包——聚合 AI 行为（执行/批准/拒绝/阻断）+ 副作用 + 审计哈希链。
   * 回答「AI 执行了什么写操作 / 谁批准 / 哪些被拒 / 审计链是否可验证」，作为 Business-safe 合规证据。
   */
  async getActionReport(
    options: { userId?: string; since?: Date; limit?: number } = {},
  ): Promise<ActionReport> {
    const where: Record<string, unknown> = {};
    if (options.userId) where.userId = options.userId;
    if (options.since) where.createdAt = Between(options.since, new Date());
    const logs = await this.logRepo.find({ where, order: { createdAt: 'DESC' } });

    let executed = 0;
    let approved = 0;
    let rejected = 0;
    let blocked = 0;
    let errors = 0;
    const byAction = new Map<string, number>();
    // B3 时间趋势：按 UTC 日聚合（createdAt.toISOString 与审计链 DB 时区一致，避免本地时区偏移）
    const byDay = new Map<string, ActionReport['byDay'][number]>();
    const bucket = (createdAt: Date): ActionReport['byDay'][number] => {
      const key = createdAt.toISOString().slice(0, 10);
      let b = byDay.get(key);
      if (!b) {
        b = { date: key, executed: 0, approved: 0, rejected: 0, blocked: 0, errors: 0 };
        byDay.set(key, b);
      }
      return b;
    };
    for (const l of logs) {
      byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
      const b = bucket(l.createdAt);
      if (l.isError) { errors++; b.errors++; }
      if (l.action === 'tool_call') {
        // blocked = 工具被拒（authorization 标记或 errorMessage 含拒绝标记：R5/越权/禁用/权限）；
        // 执行失败（无拒绝标记）只算 error，不计 blocked
        if (l.isError && (l.authorization || /blocked|denied|拒绝|越权|R5|禁用|禁止|无权/i.test(l.errorMessage ?? ''))) { blocked++; b.blocked++; }
        else if (!l.isError) { executed++; b.executed++; }
      } else if (l.action === 'tool_confirmation') {
        if (l.isError) { rejected++; b.rejected++; }
        // R4 高影响动作等待审批（pending_approval）既非 approved 也非 rejected——不计入，防合规报告虚报
        else if (!l.detail?.includes('pending_approval')) { approved++; b.approved++; }
      }
    }

    const effWhere: Record<string, unknown> = {};
    if (options.userId) effWhere.userId = options.userId;
    if (options.since) effWhere.createdAt = Between(options.since, new Date());
    const effects = await this.effectsRepo.count({ where: effWhere });

    const chain = await this.verifyChain();
    const limit = Math.min(options.limit ?? 10, 50);
    const samples = logs.slice(0, limit).map((l) => ({
      id: l.id,
      action: l.action,
      toolName: this._toolNameFromDetail(l.detail),
      isError: l.isError,
      errorMessage: l.errorMessage,
      createdAt: l.createdAt,
    }));

    return {
      period: { since: options.since ? options.since.toISOString() : null, to: new Date().toISOString() },
      summary: { executed, approved, rejected, blocked, errors, effects },
      byAction: Array.from(byAction.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byDay: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      hashChain: { valid: chain.valid, checked: chain.checked, brokenIndex: chain.brokenIndex ?? null },
      samples,
    };
  }

  /** 从审计 detail（"create_followup_task({...})"）提取工具名 */
  private _toolNameFromDetail(detail?: string | null): string | null {
    if (!detail) return null;
    const m = /^([a-z_]+)\(/.exec(detail);
    return m ? m[1] : null;
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
