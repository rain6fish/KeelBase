import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { DecisionTraceService } from '../trace/decision-trace.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { entityFor } from '../tool-effects/side-effect-revoker';
import { deriveAiBusinessEvent } from '../audit/ai-business-event';
import type { TraceStep } from '../trace/decision-trace.service';

/** REST 资源 → path 子串（防跨资源 id 碰撞；与 operation-audit interceptor 资源正则对齐） */
const REST_RESOURCE_PATHS: Record<string, string[]> = {
  crm_task: ['/crm/tasks/'],
  pm_task: ['/pm/tasks/'],
  app_request: ['/approval/requests/'],
  event: ['/api/v1/events/', '/events/'],
  contract: ['/contracts/'],
  todo: ['/todos/'],
};

export type BusinessHistorySource = 'ai-side-effect' | 'ai-trace' | 'rest-write';

export interface BusinessHistoryEvent {
  id: string;
  source: BusinessHistorySource;
  time: string;
  actorId?: string | null;
  toolName?: string | null;
  businessEvent?: string | null;
  args?: string | null;
  outcome?: string | null;
  evidence?: string | null;
  before?: string | null;
  after?: string | null;
  changes?: string | null;
  action?: string | null;
  method?: string | null;
  path?: string | null;
  /** ai-trace 完整步骤（供抽屉复用 AiTraceView 渲染） */
  steps?: TraceStep[];
  effectId?: number;
}

export interface BusinessHistoryResponse {
  target: { exists: boolean; title?: string | null; status?: string | null; deletedAt?: string | null };
  events: BusinessHistoryEvent[];
}

/**
 * §22.16 A-2 业务实体维度审计账本：按业务对象（resultType+resultId）聚合跨来源行为史——
 * AI 副作用（ai-side-effect）+ AI 决策轨迹（ai-trace）+ REST 写操作（rest-write），按时间合并。
 * 授权：admin 或实体所有者（副作用 owner / 目标实体 userId·requesterId），否则 403。
 */
@Injectable()
export class BusinessHistoryService {
  constructor(
    private readonly toolEffectsService: AiToolEffectsService,
    private readonly decisionTraceService: DecisionTraceService,
    private readonly operationAuditService: OperationAuditService,
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  async historyForEntity(
    resultType: string,
    resultId: number,
    viewer: string,
    isAdmin: boolean,
  ): Promise<BusinessHistoryResponse> {
    // 1. AI 副作用（多记录）
    const effects = await this.toolEffectsService.findManyByTarget(resultType, resultId);

    // 授权：admin 或实体所有者（副作用 owner 之一 / 目标实体 userId·requesterId）
    if (!isAdmin) {
      const owned = effects.some((e) => e.userId === viewer) || (await this._ownerOf(resultType, resultId)) === viewer;
      if (!owned) throw new ForbiddenException('无权访问该实体的行为史');
    }

    // 2. ai-trace：唯一 conversationId 逐个 peek（跳会话所有权——授权已实体级兜底）
    const convIds = [...new Set(effects.map((e) => e.conversationId).filter((c): c is string => Boolean(c)))];
    const traces = await Promise.all(
      convIds.map((cid) => this.decisionTraceService.getConversationTracePeek(cid).catch(() => null)),
    );

    // 3. rest-write：operation_audit 按 target_id + path 资源（防跨资源 id 碰撞）
    const restWrites = await this.operationAuditService.findByTargetId(String(resultId), REST_RESOURCE_PATHS[resultType] ?? []);

    // 4. 目标实体当前状态
    const target = await this._loadTarget(resultType, resultId);

    // 5. 合并三源按时间排序
    const events: BusinessHistoryEvent[] = [];
    for (const e of effects) {
      events.push({
        id: `ai-effect-${e.id}`,
        source: 'ai-side-effect',
        time: e.createdAt.toISOString(),
        actorId: e.userId,
        toolName: e.toolName,
        businessEvent: deriveAiBusinessEvent(e.toolName, e.resultType),
        before: e.beforeSnapshot ?? null,
        after: e.afterSnapshot ?? null,
        effectId: e.id,
      });
    }
    for (const t of traces) {
      if (!t) continue;
      for (const s of t.steps) {
        if (s.type !== 'tool_call' && s.type !== 'confirmation' && s.type !== 'effect') continue;
        events.push({
          id: `ai-trace-${s.id}`,
          source: 'ai-trace',
          time: s.time,
          toolName: s.toolName,
          businessEvent: s.businessEvent ?? null,
          args: s.args ?? null,
          outcome: s.outcome ?? null,
          evidence: s.evidence ?? null,
          before: s.effect?.before ?? null,
          after: s.effect?.after ?? null,
          steps: [s],
        });
      }
    }
    for (const r of restWrites) {
      events.push({
        id: `rest-${r.id}`,
        source: 'rest-write',
        time: r.createdAt.toISOString(),
        actorId: r.userId != null ? String(r.userId) : null,
        action: r.action,
        method: r.method,
        path: r.path,
        businessEvent: r.businessEvent ?? null,
        changes: r.changes ?? null,
      });
    }
    events.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

    return { target, events };
  }

  private async _ownerOf(resultType: string, resultId: number): Promise<string | null> {
    const entity = entityFor(resultType);
    if (!entity) return null;
    try {
      const repo = this.entityManager.getRepository(entity);
      const row = await repo.findOne({ where: { id: resultId } } as any);
      if (!row) return null;
      return String(row.userId ?? row.requesterId ?? '');
    } catch {
      return null;
    }
  }

  private async _loadTarget(
    resultType: string,
    resultId: number,
  ): Promise<BusinessHistoryResponse['target']> {
    const entity = entityFor(resultType);
    if (!entity) return { exists: false };
    try {
      const repo = this.entityManager.getRepository(entity);
      const row = await repo.findOne({ where: { id: resultId }, withDeleted: true } as any);
      if (!row) return { exists: false };
      return {
        exists: true,
        title: row.title ?? null,
        status: row.status ?? row.state ?? null,
        deletedAt: row.deletedAt ? (row.deletedAt as Date).toISOString() : null,
      };
    } catch {
      return { exists: false };
    }
  }
}
