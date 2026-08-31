/**
 * AI 审计日志服务
 *
 * 记录所有 AI 交互：对话、工具调用、错误等。
 * 数据持久化到 ai_audit_logs 表，支持后续的用量分析和安全审计。
 */

import { createHmac } from 'crypto';
import { Injectable, Optional, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { AiService } from '../ai.service';
import { AiAgentService } from '../agents/ai-agent.service';
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
import { summarizeAudit, AuditInterpretation, AuditInterpretationRow } from './audit-interpreter.service';
import { GOVERNANCE_REPORTER } from '../governance/governance-reporter.service';
import type { GovernanceReporter } from '../governance/governance-reporter.service';
import { CacheService } from '../../common/cache/cache.service';

export interface AuditEntry {
  userId: string;
  /** D2-1c username 快照：写审计时快照用户名（独立治理库后查询无需左联 users） */
  username?: string;
  conversationId?: string;
  action: 'chat' | 'tool_call' | 'navigate' | 'error' | 'login' | 'plan' | 'analyze' | 'knowledge' | 'delegate' | 'tool_confirmation' | 'flow_node' | 'content_blocked';
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
  /** §22.16 A-1 业务事件名（CustomerRiskAssessed/FollowupTaskCreated 等，跨系统归一；链外） */
  businessEvent?: string;
  /** §22.16 A-1 Decision Evidence（JSON：{decision, evidence[], policy, confidence}；链外） */
  evidence?: string;
}

/** B3/E-2 按 UTC 日聚合的趋势桶（5 段：执行/批准/拒绝/阻断/错误） */
export interface AuditByDayBucket {
  date: string;
  executed: number;
  approved: number;
  rejected: number;
  blocked: number;
  errors: number;
}

export interface UsageStats {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  totalErrors: number;
  topActions: Array<{ action: string; count: number }>;
  /** E-2 趋势：按 UTC 日聚 5 段（executed/approved/rejected/blocked/errors） */
  byDay: AuditByDayBucket[];
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
  byDay: AuditByDayBucket[];
  hashChain: { valid: boolean; checked: number; brokenIndex: number | null };
  samples: Array<{
    id: number;
    action: string;
    toolName: string | null;
    isError: boolean;
    errorMessage?: string | null;
    /** §22.16 A-6 合规：Decision Evidence + 责任链展示字段 */
    businessEvent?: string | null;
    evidence?: string | null;
    agentId?: string | null;
    createdAt: Date;
  }>;
  /** E-1 字段级变更审计：副作用 before/after 快照（limit 50，供证据包人工复核） */
  effectDiffs: Array<{
    id: number;
    toolName: string;
    resultType: string;
    resultId: number;
    createdAt: Date;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>;
}

/** A2 证据包 v2：链上原始行（payload 供离线重算），审计机构可独立机器验证 */
export interface EvidenceChainRow {
  /** 链序号（1 起，沿 id 升序） */
  seq: number;
  id: number;
  prevHash: string | null;
  hash: string;
  /** 链 payload（canonical 输入，与写入侧一致——verify-evidence.mjs 离线重算用） */
  payload: Record<string, unknown>;
}

/** D4 审计证据包：可提交审计机构的合规证据（报告 + 哈希链校验 + 导出时间戳 + 签名） */
export interface ActionReportExport {
  /** 证据包生成时间（ISO 8601） */
  exportedAt: string;
  /** 生成的工具（AUDIT_HMAC_KEY 或 ENCRYPTION_KEY，非空时） */
  generator: string;
  /** A2：证据包格式版本（'keelbase-audit-evidence/2'——A-6 含 compliance 段） */
  format: string;
  /** ActionReport 全量（含 hashChain verify） */
  report: ActionReport;
  /** §22.16 A-6 合规：samples 每条的业务摘要 + 责任链 + 授权依据（签名覆盖防篡改） */
  compliance: Array<{
    id: number;
    businessEvent: string | null;
    evidence: string | null;
    summary: { sentence: string; stats: unknown } | null;
    identityChain: unknown | null;
  }>;
  /** A2：链上原始行全量（id/prevHash/hash + payload），供 verify-evidence.mjs 离线重算 */
  chain: EvidenceChainRow[];
  /** 证据包签名：对 summary + hashChain + effectDiffs + compliance + chain + exportedAt 做 HMAC-SHA256（可复核完整性）；未配密钥时为 null */
  signature: string | null;
}

/** E-2 哈希链可视化：逐行链节点（verify 端点返回的切片） */
export interface AuditChainNode {
  id: number;
  createdAt: Date;
  action: string;
  toolName: string | null;
  prevHash: string | null;
  hash: string | null;
  isError: boolean;
  /** 断链行（prevHash 不连续 / hash 不符） */
  broken?: boolean;
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
  /** §22.16 A-1 业务事件名（CustomerRiskAssessed 等；链外） */
  businessEvent?: string | null;
  /** §22.16 A-1 Decision Evidence（JSON 字符串；链外） */
  evidence?: string | null;
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
    // D2-3b：可选治理上报（主应用配 GOVERNANCE_URL 时双写上报；治理台自身不提供 → 不上报）
    @Optional() @Inject(GOVERNANCE_REPORTER)
    private readonly reporter?: GovernanceReporter,
    // E-3 聚合缓存（审计统计/成本/报告/verify 短 TTL；log 热路径只失效 verify 单 key 族）
    @Optional() private readonly cacheService?: CacheService,
    // §22.16 A-5 跨系统身份链：授权依据（AiService.explainAuthorization）+ Agent 解析
    @Optional() @Inject(forwardRef(() => AiService))
    private readonly aiService?: AiService,
    @Optional() private readonly agentService?: AiAgentService,
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
      businessEvent: entry.businessEvent,
      evidence: entry.evidence,
    };

    if (this.dataSource.options.type === 'postgres') {
      // DB 级串行（roadmap §22.10 B）：事务内锁 audit_chain_lock id=1（SELECT FOR UPDATE），
      // 跨实例串行化「读 lastHash → 计算 → 插入」——多副本不再分叉。
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        // 锁行可能缺失（synchronize 建表不 seed / 治理台独立库）→ 先幂等 ensure，再取行锁
        await runner.query(
          `INSERT INTO "audit_chain_lock" (id, holder) VALUES (1, 'seed') ON CONFLICT (id) DO NOTHING`,
        );
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
    // D2-3b：审计双写上报治理台（配置 GOVERNANCE_URL 时；治理台自身不配不启用）
    if (this.reporter?.enabled) {
      void this.reporter
        .reportAudit({
          userId: entry.userId,
          username,
          action: entry.action,
          detail: entry.detail,
          model: entry.model,
          provider: entry.provider,
          agentId,
          conversationId: entry.conversationId,
          source: entry.source,
          promptTokens: entry.promptTokens,
          completionTokens: entry.completionTokens,
          durationMs: entry.durationMs,
          isError: entry.isError ?? false,
          errorMessage: entry.errorMessage,
          authorization: entry.authorization,
        })
        .catch(() => {});
    }
    // E-3：新审计入链 → 哈希链 verify 缓存失效（聚合 stats/cost/report 靠 60s TTL 自过期，不做热路径失效）
    await this.cacheService?.delByPrefix('audit:verify');
  }

  /** HS-11：沿 id 升序校验审计哈希链完整性。返回含逐行链明细（切片，供 E-2 哈希链可视化）。60s 缓存（消除 action-report 二次全表扫描）。 */
  async verifyChain(): Promise<ChainVerification & { chain: AuditChainNode[] }> {
    const cached = await this.cacheService?.get<ChainVerification & { chain: AuditChainNode[] }>('audit:verify');
    if (cached) return cached;
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    const result = this.auditChain.verifyChain(rows, (row) => this._payload(row));
    const detailed = { ...result, chain: this._chainSlice(rows, result) };
    await this.cacheService?.set('audit:verify', detailed, 60_000);
    return detailed;
  }

  /** E-2：把全量链切成可视窗口——valid 取最近 N；broken 以断点为中心窗口（断点行标 broken）。 */
  private _chainSlice(rows: AiAuditLog[], result: ChainVerification): AuditChainNode[] {
    const CHAIN_SLICE = 24;
    const b = result.brokenIndex ? result.brokenIndex - 1 : -1;
    let window: AiAuditLog[];
    let brokenOffset = -1;
    if (result.valid || b < 0) {
      window = rows.slice(-CHAIN_SLICE);
    } else {
      const start = Math.max(0, b - 6);
      const end = Math.min(rows.length, b + 4);
      window = rows.slice(start, end);
      brokenOffset = b - start;
    }
    return window.map((row, i) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      toolName: this._toolNameFromDetail(row.detail),
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? null,
      isError: row.isError ?? false,
      broken: i === brokenOffset,
    }));
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
      // §22.16 A-1 business_event/evidence 是链外注解列（业务事件名 + Decision Evidence JSON，推理型展示数据）：
      // 写入与校验两侧恒置 null，保证 canonical payload 一致，防止写入断链（同 feedback 前例）
      businessEvent: null,
      evidence: null,
    };
  }

  async getUserLogs(
    userId: string,
    options: { limit?: number; offset?: number; since?: Date } = {},
  ): Promise<AiAuditLogWithUser[]> {
    return this._queryLogs({ userId, ...options });
  }

  async getLogs(
    options: { limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string; isError?: 'true' | 'false' } = {},
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
    options: { userId?: string; limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string; isError?: 'true' | 'false' } = {},
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
    if (options.isError) qb.andWhere('log.is_error = :isError', { isError: options.isError === 'true' });
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
      // §22.16 A-1 业务行为取证：业务事件名 + Decision Evidence（链外透出）
      businessEvent: r.log_business_event ?? null,
      evidence: r.log_evidence ?? null,
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
      byDay: this._byDayAggregation(logs),
    };
  }

  /**
   * §10 P1 AI Action Report：合规证据包——聚合 AI 行为（执行/批准/拒绝/阻断）+ 副作用 + 审计哈希链。
   * 回答「AI 执行了什么写操作 / 谁批准 / 哪些被拒 / 审计链是否可验证」，作为 Business-safe 合规证据。
   */
  async getActionReport(
    options: { userId?: string; since?: Date; limit?: number } = {},
    fresh = false,
  ): Promise<ActionReport> {
    // E-3 聚合缓存：60s TTL；证据包导出（fresh）绕缓存直算（hashChain 必须当前）
    const sinceDay = options.since ? options.since.toISOString().slice(0, 10) : 'all';
    const cacheKey = `audit:report:${options.userId ?? 'all'}:${sinceDay}:${options.limit ?? 10}`;
    if (!fresh) {
      const cached = await this.cacheService?.get<ActionReport>(cacheKey);
      if (cached) return cached;
    }
    const where: Record<string, unknown> = {};
    if (options.userId) where.userId = options.userId;
    if (options.since) where.createdAt = Between(options.since, new Date());
    // E-3 列投影：只载聚合所需列（detail/errorMessage/authorization 保留——samples 工具名解析 + blocked 正则）
    // §22.16 A-6 合规：补 businessEvent/evidence/agentId（Decision Evidence + 责任链）
    const logs = await this.logRepo.find({
      where,
      order: { createdAt: 'DESC' },
      select: {
        id: true, action: true, detail: true, isError: true, errorMessage: true, authorization: true,
        businessEvent: true, evidence: true, agentId: true, createdAt: true,
      },
    });

    let executed = 0;
    let approved = 0;
    let rejected = 0;
    let blocked = 0;
    let errors = 0;
    const byAction = new Map<string, number>();
    for (const l of logs) {
      byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
      if (l.isError) { errors++; }
      if (l.action === 'tool_call') {
        // blocked = 工具被拒（authorization 标记或 errorMessage 含拒绝标记：R5/越权/禁用/权限）；
        // 执行失败（无拒绝标记）只算 error，不计 blocked
        if (l.isError && (l.authorization || /blocked|denied|拒绝|越权|R5|禁用|禁止|无权/i.test(l.errorMessage ?? ''))) { blocked++; }
        else if (!l.isError) { executed++; }
      } else if (l.action === 'tool_confirmation') {
        if (l.isError) { rejected++; }
        // R4 高影响动作等待审批（pending_approval）既非 approved 也非 rejected——不计入，防合规报告虚报
        else if (!l.detail?.includes('pending_approval')) { approved++; }
      }
    }
    // B3 时间趋势：按 UTC 日聚 5 段（与 getAllStats 共享 _byDayAggregation，避免重复聚合逻辑）
    const byDay = this._byDayAggregation(logs);

    const effWhere: Record<string, unknown> = {};
    if (options.userId) effWhere.userId = options.userId;
    if (options.since) effWhere.createdAt = Between(options.since, new Date());
    const effects = await this.effectsRepo.count({ where: effWhere });
    // E-1 字段级变更审计：副作用 before/after 快照示例（证据包人工复核；解析失败降级 null）
    const effectRows = await this.effectsRepo.find({
      where: effWhere,
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const effectDiffs = effectRows.map((e) => ({
      id: e.id,
      toolName: e.toolName,
      resultType: e.resultType,
      resultId: e.resultId,
      createdAt: e.createdAt,
      before: parseSnapshot(e.beforeSnapshot),
      after: parseSnapshot(e.afterSnapshot),
    }));

    const chain = await this.verifyChain();
    const limit = Math.min(options.limit ?? 10, 50);
    const samples = logs.slice(0, limit).map((l) => ({
      id: l.id,
      action: l.action,
      toolName: this._toolNameFromDetail(l.detail),
      isError: l.isError,
      errorMessage: l.errorMessage,
      businessEvent: l.businessEvent ?? null,
      evidence: l.evidence ?? null,
      agentId: l.agentId ?? null,
      createdAt: l.createdAt,
    }));

    const result = {
      period: { since: options.since ? options.since.toISOString() : null, to: new Date().toISOString() },
      summary: { executed, approved, rejected, blocked, errors, effects },
      byAction: Array.from(byAction.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byDay,
      hashChain: { valid: chain.valid, checked: chain.checked, brokenIndex: chain.brokenIndex ?? null },
      samples,
      effectDiffs,
    };
    if (!fresh) await this.cacheService?.set(cacheKey, result, 60_000);
    return result;
  }

  /** D4 审计证据包导出：ActionReport + 哈希链校验 + 导出时间戳 + 签名（可提交审计机构）。A2：含全量链原始行，可离线机器验证。 */
  async getActionReportExport(
    options: { userId?: string; since?: Date; limit?: number } = {},
  ): Promise<ActionReportExport> {
    const report = await this.getActionReport(options, true);
    const exportedAt = new Date().toISOString();
    const signingKey = process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || '';
    // A2：全量链原始行（payload 与写入侧 _payload 一致，供 scripts/verify-evidence.mjs 离线重算）
    const rows = await this.logRepo.find({ order: { id: 'ASC' } });
    const chain: EvidenceChainRow[] = rows.map((row, i) => ({
      seq: i + 1,
      id: row.id,
      prevHash: row.prevHash ?? null,
      hash: row.hash ?? '',
      payload: this._payload(row),
    }));
    // §22.16 A-6 合规：内存批建（byId/byConv/agentCache，零额外查询）——samples 每条出业务摘要 + 责任链 + 授权依据
    const byId = new Map(rows.map((r) => [r.id, r]));
    const byConv = new Map<string, AiAuditLog[]>();
    for (const r of rows) {
      if (r.conversationId) {
        const list = byConv.get(r.conversationId) ?? [];
        list.push(r);
        byConv.set(r.conversationId, list);
      }
    }
    const agentCache = new Map<string, { name: string; trustLevel: string; purpose?: string | null } | null>();
    const compliance = [];
    for (const s of report.samples ?? []) {
      const row = byId.get(s.id);
      if (!row) {
        compliance.push({ id: s.id, businessEvent: null, evidence: null, summary: null, identityChain: null });
        continue;
      }
      const convRows = row.conversationId ? (byConv.get(row.conversationId) ?? []) : [];
      const summary = summarizeAudit(row, convRows as unknown as AuditInterpretationRow[]);
      compliance.push({
        id: s.id,
        businessEvent: row.businessEvent ?? null,
        evidence: row.evidence ?? null,
        summary: { sentence: summary.sentence, stats: summary.stats },
        identityChain: await this._identityChainFromRow(row, convRows, agentCache),
      });
    }
    const canonical = JSON.stringify({
      summary: report.summary,
      hashChain: report.hashChain,
      effectDiffs: report.effectDiffs,
      compliance,
      chain,
      exportedAt,
    });
    const signature = signingKey
      ? createHmac('sha256', signingKey).update(canonical).digest('hex')
      : null;
    return {
      exportedAt,
      generator: 'keelbase-audit-export',
      format: 'keelbase-audit-evidence/2',
      report,
      compliance,
      chain,
      signature,
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

  /** §22.16 A-4 审计解释器：单行审计 + 同对话上下文 → 业务摘要 + 证据统计（demo 可用，无 LLM 依赖） */
  async getInterpretation(id: number): Promise<{
    row: AiAuditLog;
    summary: AuditInterpretation;
    conversation: Array<{
      id: number; action: string; detail?: string | null; businessEvent?: string | null;
      evidence?: string | null; isError: boolean; errorMessage?: string | null; createdAt: Date;
    }>;
  }> {
    const row = await this.logRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('审计记录不存在');
    const where = row.conversationId ? { conversationId: row.conversationId } : {};
    const convRows = await this.logRepo.find({
      where,
      select: {
        id: true, userId: true, username: true, action: true, detail: true,
        businessEvent: true, evidence: true, isError: true, errorMessage: true, createdAt: true,
      },
      order: { createdAt: 'ASC' },
    });
    const summary = summarizeAudit(row, convRows as unknown as AuditInterpretationRow[]);
    return { row, summary, conversation: convRows };
  }

  /** §22.16 A-5 跨系统身份链：审计行 → Human→Intent→Agent→Tool→Action + 授权依据（拒绝 checks / 放行 explain）+ 同会话工具序列 */
  async getChain(id: number): Promise<{
    row: { id: number; userId: string; username?: string | null; action: string; createdAt: Date };
    human: { userId: string; username: string | null };
    intent: string | null;
    agent: { agentId: string | null; agentName: string | null; trustLevel: string | null; callerAgentId: string | null };
    tool: { toolName: string | null };
    action: { businessEvent: string | null; evidence: string | null };
    source: string | null;
    authorization: { denied: Array<{ name: string; ok: boolean; note?: string }> | null; allowed: Record<string, unknown> | null };
    chain: Array<{ id: number; action: string; toolName: string | null; businessEvent?: string | null; agentId?: string | null; createdAt: Date }>;
  }> {
    const row = await this.logRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('审计记录不存在');
    const convRows = row.conversationId
      ? await this.logRepo.find({ where: { conversationId: row.conversationId }, order: { createdAt: 'ASC' }, take: 50 })
      : [];
    const identity = await this._identityChainFromRow(row, convRows);
    return {
      row: { id: row.id, userId: row.userId, username: row.username ?? null, action: row.action, createdAt: row.createdAt },
      ...identity,
      chain: convRows.map((r) => ({
        id: r.id,
        action: r.action,
        toolName: this._toolNameFromDetail(r.detail),
        businessEvent: r.businessEvent ?? null,
        agentId: r.agentId ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** §22.16 A-6 合规：从行构建身份链（Human→Agent→Tool→Action + 授权依据）；agentCache 供批量复用去重 */
  private async _identityChainFromRow(
    row: AiAuditLog,
    _convRows: AiAuditLog[],
    agentCache?: Map<string, { name: string; trustLevel: string; purpose?: string | null } | null>,
  ): Promise<{
    human: { userId: string; username: string | null };
    intent: string | null;
    agent: { agentId: string | null; agentName: string | null; trustLevel: string | null; callerAgentId: string | null };
    tool: { toolName: string | null };
    action: { businessEvent: string | null; evidence: string | null };
    source: string | null;
    authorization: { denied: Array<{ name: string; ok: boolean; note?: string }> | null; allowed: Record<string, unknown> | null };
  }> {
    const toolName = this._toolNameFromDetail(row.detail);
    const agent = row.agentId
      ? (agentCache?.get(row.agentId) ?? (await this.agentService?.findByAgentId(row.agentId)))
      : null;
    if (row.agentId && agentCache && !agentCache.has(row.agentId)) agentCache.set(row.agentId, agent ?? null);
    const denied = parseChecks(row.authorization);
    let allowed: Record<string, unknown> | null = null;
    if (!denied && toolName) {
      try {
        allowed = (await this.aiService?.explainAuthorization(toolName, row.userId)) ?? null;
      } catch {
        allowed = null;
      }
    }
    return {
      human: { userId: row.userId, username: row.username ?? null },
      intent: row.businessIntent ?? null,
      agent: {
        agentId: row.agentId ?? null,
        agentName: agent?.name ?? null,
        trustLevel: agent?.trustLevel ?? null,
        callerAgentId: row.callerAgentId ?? null,
      },
      tool: { toolName },
      action: { businessEvent: row.businessEvent ?? null, evidence: row.evidence ?? null },
      source: row.source ?? null,
      authorization: { denied, allowed },
    };
  }

  async getAllStats(since?: Date): Promise<UsageStats> {
    const sinceDay = since ? since.toISOString().slice(0, 10) : 'all';
    const cached = await this.cacheService?.get<UsageStats>(`audit:stats:${sinceDay}`);
    if (cached) return cached;
    const where: any = {};
    if (since) where.createdAt = Between(since, new Date());

    // E-3 性能：列投影——只加载聚合所需列（action/tokens/isError/createdAt），避免大字段（detail/model）全量载内存
    const logs = await this.logRepo.find({
      where,
      select: { action: true, promptTokens: true, completionTokens: true, isError: true, createdAt: true, detail: true, authorization: true, errorMessage: true },
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
      byDay: this._byDayAggregation(logs),
    };
    await this.cacheService?.set(`audit:stats:${sinceDay}`, result, 60_000);
    return result;
  }

  /** B3/E-2：按 UTC 日聚合 5 段趋势（getActionReport 与 getAllStats 共享，避免重复聚合逻辑）。 */
  private _byDayAggregation(logs: AiAuditLog[]): AuditByDayBucket[] {
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
        if (l.isError && (l.authorization || /blocked|denied|拒绝|越权|R5|禁用|禁止|无权/i.test(l.errorMessage ?? ''))) b.blocked++;
        else if (!l.isError) b.executed++;
      } else if (l.action === 'tool_confirmation') {
        if (l.isError) b.rejected++;
        else if (!l.detail?.includes('pending_approval')) b.approved++;
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** §22.16 A-5：authorization 列 checks[] JSON 安全解析（非法/非数组降级 null） */
function parseChecks(raw?: string | null): Array<{ name: string; ok: boolean; note?: string }> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<{ name: string; ok: boolean; note?: string }>) : null;
  } catch {
    return null;
  }
}

/** E-1：副作用快照 JSON 安全解析（非法/非对象降级 null） */
function parseSnapshot(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
