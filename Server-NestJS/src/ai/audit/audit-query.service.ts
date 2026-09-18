// SPDX-License-Identifier: Apache-2.0

/**
 * 审计日志查询（从 `AuditService` 拆出的第二个领域，健康清单 §3 阶段 3）。
 *
 * 与聚合域同一理由：这些方法只**读**日志、只做过滤与行映射，与「写进哈希链」毫无关系，
 * 却和写入路径挤在同一个 1300 行的类里。拆开后写入（`AuditService`）与读取（本类）各自独立。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { aiActionLabel } from './ai-feature-map';

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
  /** AU-2（§22.19）：客户端来源 IP（链外归因列） */
  ip?: string | null;
  /** AU-3（§22.19）：访客标识（链外归因列，与账号无关——演示端共享账号下区分访客） */
  guestId?: string | null;
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
  /** §internal.16 A-1 业务事件名（CustomerRiskAssessed 等；链外） */
  businessEvent?: string | null;
  /** §internal.16 A-1 Decision Evidence（JSON 字符串；链外） */
  evidence?: string | null;
}

@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AiAuditLog) private readonly logRepo: Repository<AiAuditLog>,
  ) {}

  async getUserLogs(
    userId: string,
    options: { limit?: number; offset?: number; since?: Date } = {},
  ): Promise<AiAuditLogWithUser[]> {
    return this._queryLogs({ userId, ...options });
  }

  async getLogs(
    options: { limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string; isError?: 'true' | 'false'; denied?: 'true' } = {},
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
    options: { userId?: string; limit?: number; offset?: number; since?: Date; feedback?: string; orgId?: number; agentId?: string; isError?: 'true' | 'false'; denied?: 'true' } = {},
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
    // A-8 越权专门视图：错误事件 + 携带授权数据（越权/阻断而非普通失败——「AI 被拒」同样是安全证据）
    if (options.denied) {
      qb.andWhere('log.is_error = :deniedIsErr', { deniedIsErr: true });
      qb.andWhere("log.authorization IS NOT NULL AND log.authorization <> ''");
    }
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
      ip: r.log_ip ?? null,
      guestId: r.log_guest_id ?? null,
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
      // §internal.16 A-1 业务行为取证：业务事件名 + Decision Evidence（链外透出）
      businessEvent: r.log_business_event ?? null,
      evidence: r.log_evidence ?? null,
    };
    });
  }

}
