// SPDX-License-Identifier: Apache-2.0

/**
 * AI 审计日志服务
 *
 * 记录所有 AI 交互：对话、工具调用、错误等。
 * 数据持久化到 ai_audit_logs 表，支持后续的用量分析和安全审计。
 */

import { createHmac, createHash } from 'crypto';
import { Injectable, Optional, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuthorizationExplainerService } from '../authorization-explainer.service';
import { AiAgentService } from '../agents/ai-agent.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository, Between, LessThan, MoreThan } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AiDailyUsage } from './ai-daily-usage.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { actorContext } from '../actor-context';
import { requestContext } from '../../common/request-context';
import {
  AuditChainService,
  ChainVerification,
} from '../../common/audit-chain/audit-chain.service';
import { aiActionLabel } from './ai-feature-map';
import { extractToolName } from './tool-name';
import { buildPayload } from './payload';
import { AUDIT_VERIFY_CACHE_KEY } from './cache-keys';
import { AuditByDayBucket, byDayAggregation } from './by-day';
import { summarizeAudit, AuditInterpretation, AuditInterpretationRow, AuditInterpreterStats } from './audit-interpreter.service';
import { GovernancePolicyService } from '../governance/governance-policy.service';
import { GOVERNANCE_REPORTER } from '../governance/governance-reporter.service';
import type { GovernanceReporter } from '../governance/governance-reporter.service';
import { CacheService } from '../../common/cache/cache.service';
import { buildSm2Block, sm2ConfigFromEnv, Sm2SignatureBlock } from '../../common/crypto/sm2';

export interface AuditEntry {
  userId: string;
  /** D2-1c username 快照：写审计时快照用户名（独立治理库后查询无需左联 users） */
  username?: string;
  conversationId?: string;
  action: 'chat' | 'tool_call' | 'navigate' | 'error' | 'login' | 'plan' | 'analyze' | 'knowledge' | 'delegate' | 'tool_confirmation' | 'flow_node' | 'content_blocked' | 'effect_revoke';
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
  /** §internal.16 A-1 业务事件名（CustomerRiskAssessed/FollowupTaskCreated 等，跨系统归一；链外） */
  businessEvent?: string;
  /** §internal.16 A-1 Decision Evidence（JSON：{decision, evidence[], policy, confidence}；链外） */
  evidence?: string;
}



@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AiAuditLog)
    private readonly logRepo: Repository<AiAuditLog>,
    @InjectRepository(AiDailyUsage)
    private readonly usageRepo: Repository<AiDailyUsage>,
    private readonly auditChain: AuditChainService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // D2-3b：可选治理上报（主应用配 GOVERNANCE_URL 时双写上报；治理台自身不提供 → 不上报）
    @Optional() @Inject(GOVERNANCE_REPORTER)
    private readonly reporter?: GovernanceReporter,
    // E-3 聚合缓存（审计统计/成本/报告/verify 短 TTL；log 热路径只失效 verify 单 key 族）
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /** 审计写串行队列：sqlite（单写者，better-sqlite3 单连接不支持多 QueryRunner 并发事务）用进程内串行；postgres 用 DB 级串行锁（internal-roadmap §internal.10 B） */
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
    // AU-6（§22.19 归因层）：入口来源 source 从 ActorContext fallback（各入口设置，entry 显式传值优先）
    const source = entry.source ?? actor?.source;
    // AU-2 / AU-3（§22.19）：客户端 IP 与访客标识从请求级 requestContext（中间件设置）；链外列，不入 payload
    const { ip, guestId } = requestContext.getStore() ?? {};

    // G-2（§internal.17 ① G-2）：payload v2 = 既有字段 + 链外归责/意图/来源/业务注解列（businessEvent/evidence/agentId/...）。
    // 新行 payloadVersion=2 → _payload 走 v2 含真实注解值（DB 层篡改链外列会破链）；历史行 null → v1 恒空（不破坏既有链）。
    const payload = buildPayload({
      payloadVersion: 2,
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
      agentId,
      sessionId,
      parentActionId: entry.parentActionId,
      callerAgentId,
      delegationContext: entry.delegationContext,
      businessIntent,
      source,
      businessEvent: entry.businessEvent,
      evidence: entry.evidence,
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
      source,
      ip,
      guestId,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      durationMs: entry.durationMs,
      isError: entry.isError ?? false,
      errorMessage: entry.errorMessage,
      authorization: entry.authorization,
      businessEvent: entry.businessEvent,
      evidence: entry.evidence,
      payloadVersion: 2,
    };

    if (this.dataSource.options.type === 'postgres') {
      // DB 级串行（internal-roadmap §internal.10 B）：事务内锁 audit_chain_lock id=1（SELECT FOR UPDATE），
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
    await this.cacheService?.delByPrefix(AUDIT_VERIFY_CACHE_KEY);
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



}
