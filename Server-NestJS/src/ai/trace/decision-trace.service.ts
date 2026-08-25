/**
 * P0-14 Agent Decision Trace：用户可见的 AI 执行轨迹。
 *
 * 把分散在 ai_messages（输入/回复）、ai_audit_logs（工具调用/确认/完成/错误）、
 * ai_tool_side_effects（写操作实际创建记录）三张表的数据，合并为按时间排序的
 * TraceStep 时间线——用户本人可在对话历史里查看「AI 为什么做这一步」。
 *
 * 所有权闸门复用 ConversationService.getConversation（CASL），非本人 404/403。
 * 只读聚合，不写库、不新增表。
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAuditLog } from '../audit/ai-audit-log.entity';
import { ConversationService } from '../conversation/conversation.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import type { AppAbility } from '../../common/casl/casl-ability.factory';

export type TraceStepType =
  | 'input' // 用户提问
  | 'assistant' // AI 文本回复（非空）
  | 'tool_call' // AI 调用工具（含成功/失败）
  | 'confirmation' // 写操作确认决策
  | 'effect' // 写工具实际创建的记录
  | 'notice'; // chat/knowledge/plan/analyze/error/navigate 等摘要

export interface TraceEffect {
  effectId: number;
  resultType: string;
  resultId: number;
  targetTitle?: string | null;
  revocable: boolean;
}

export interface TraceStep {
  id: string;
  type: TraceStepType;
  time: string;
  toolName?: string;
  args?: string;
  success?: boolean;
  errorMessage?: string | null;
  /** W5-⑦ Explainable Authz：工具被拒时 AuthorizationDeniedError 的检查清单（为何阻止） */
  checks?: Array<{ name: string; ok: boolean; note?: string }>;
  outcome?: 'approve' | 'decline' | 'timeout';
  trusted?: boolean;
  content?: string;
  detail?: string | null;
  model?: string;
  provider?: string;
  tokens?: number;
  effect?: TraceEffect;
  /** D4 多 Agent 归责：执行该步骤的子 agent 标识 / 调用方 agent */
  agentId?: string;
  callerAgentId?: string;
}

export interface DecisionTrace {
  conversation: {
    id: string;
    provider: string;
    model: string;
    summary?: string | null;
    createdAt: string;
    lastActivityAt: string;
  };
  steps: TraceStep[];
}

@Injectable()
export class DecisionTraceService {
  constructor(
    @InjectRepository(AiAuditLog)
    private readonly auditRepo: Repository<AiAuditLog>,
    private readonly conversationService: ConversationService,
    private readonly toolEffectsService: AiToolEffectsService,
  ) {}

  async getConversationTrace(
    id: string,
    userId: string,
    ability: AppAbility,
  ): Promise<DecisionTrace> {
    // 所有权闸门：非本人/不存在在此抛出 404/403
    const conv = await this.conversationService.getConversation(id, userId, ability);

    const [logs, effects] = await Promise.all([
      this.auditRepo.find({
        where: { conversationId: id },
        order: { createdAt: 'ASC' },
      }),
      this.toolEffectsService.listForConversation(id),
    ]);

    const steps: TraceStep[] = [];

    // 消息 → input / assistant（tool 原始结果与 system 提示不进轨迹）
    conv.messages.forEach((m, i) => {
      if (m.role === 'user') {
        steps.push({ id: `msg-${i}`, type: 'input', time: m.timestamp, content: m.content });
      } else if (m.role === 'assistant' && m.content && m.content.trim().length > 0) {
        steps.push({ id: `msg-${i}`, type: 'assistant', time: m.timestamp, content: m.content });
      }
    });

    // 审计日志 → tool_call / confirmation / notice
    for (const log of logs) {
      if (log.action === 'tool_call') {
        const { toolName, args } = parseToolCall(log.detail);
        steps.push({
          id: `tool-${log.id}`,
          type: 'tool_call',
          time: log.createdAt.toISOString(),
          toolName,
          args,
          success: !log.isError,
          errorMessage: log.errorMessage,
          checks: parseChecks(log.authorization),
          agentId: log.agentId,
          callerAgentId: log.callerAgentId,
        });
      } else if (log.action === 'tool_confirmation') {
        const parsed = parseConfirmation(log.detail);
        steps.push({
          id: `conf-${log.id}`,
          type: 'confirmation',
          time: log.createdAt.toISOString(),
          toolName: parsed.toolName,
          args: parsed.args,
          outcome: parsed.outcome,
          trusted: parsed.trusted,
          agentId: log.agentId,
          callerAgentId: log.callerAgentId,
        });
      } else {
        const tokens = (log.promptTokens ?? 0) + (log.completionTokens ?? 0);
        steps.push({
          id: `log-${log.id}`,
          type: 'notice',
          time: log.createdAt.toISOString(),
          detail: log.detail,
          model: log.model,
          provider: log.provider,
          tokens: tokens > 0 ? tokens : undefined,
          success: !log.isError,
          errorMessage: log.errorMessage,
          agentId: log.agentId,
          callerAgentId: log.callerAgentId,
        });
      }
    }

    // 写操作副作用 → effect（AI 实际创建/修改的记录）
    for (const eff of effects) {
      steps.push({
        id: `effect-${eff.id}`,
        type: 'effect',
        time: eff.createdAt,
        toolName: eff.toolName,
        effect: {
          effectId: eff.id,
          resultType: eff.resultType,
          resultId: eff.resultId,
          targetTitle: eff.targetTitle ?? null,
          revocable: eff.targetExists && !eff.targetSoftDeleted,
        },
      });
    }

    steps.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

    return {
      conversation: {
        id: conv.id,
        provider: conv.provider,
        model: conv.model,
        summary: conv.summary ?? null,
        createdAt: conv.createdAt,
        lastActivityAt: conv.lastActivityAt,
      },
      steps,
    };
  }
}

/** W5-⑦：authorization 列是 AuthorizationDeniedError.reasons（checks[]）的 JSON；非法/缺失返回 undefined */
function parseChecks(raw?: string | null): Array<{ name: string; ok: boolean; note?: string }> | undefined {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : undefined;
  } catch {
    return undefined;
  }
}

/** detail 形如 `create_event({"title":"..."})` → 拆出工具名与参数 JSON 字符串 */
function parseToolCall(detail?: string | null): { toolName: string; args?: string } {
  if (!detail) return { toolName: '' };
  const m = /^([\w]+)\((.*)\)$/s.exec(detail);
  return m ? { toolName: m[1], args: m[2] } : { toolName: detail };
}

/** detail 形如 `create_event({...}) → approve (trusted)` → 拆出工具名/参数/决策/免确认标志 */
function parseConfirmation(
  detail?: string | null,
): { toolName: string; args?: string; outcome: 'approve' | 'decline' | 'timeout'; trusted: boolean } {
  const m = /^([\w]+)\((.*)\)\s*→\s*(\w+)(?:\s*\((trusted)\))?$/s.exec(detail || '');
  if (m) {
    const raw = m[3];
    const outcome = raw === 'approve' ? 'approve' : raw === 'decline' ? 'decline' : 'timeout';
    return { toolName: m[1], args: m[2], outcome, trusted: m[4] === 'trusted' };
  }
  return { toolName: detail || '', outcome: 'timeout', trusted: false };
}
