// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { BusinessHistoryService } from './business-history.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { DecisionTraceService } from '../trace/decision-trace.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';

describe('BusinessHistoryService（§internal.16 A-2 业务实体行为史）', () => {
  let service: BusinessHistoryService;
  const effectsService = { findManyByTarget: jest.fn() };
  const traceService = { getConversationTracePeek: jest.fn() };
  const opService = { findByTargetId: jest.fn() };
  const entityManager = { getRepository: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BusinessHistoryService,
        { provide: AiToolEffectsService, useValue: effectsService },
        { provide: DecisionTraceService, useValue: traceService },
        { provide: OperationAuditService, useValue: opService },
        { provide: getEntityManagerToken(), useValue: entityManager },
      ],
    }).compile();
    service = module.get(BusinessHistoryService);
  });

  it('admin 聚合三源按时间升序 + source 标签 + 目标状态', async () => {
    effectsService.findManyByTarget.mockResolvedValue([
      { id: 1, userId: '1', toolName: 'create_followup_task', resultType: 'crm_task', resultId: 42, conversationId: 'c1', createdAt: new Date('2026-08-31T01:00:00Z'), beforeSnapshot: null, afterSnapshot: '{"id":42,"title":"跟进"}' },
    ]);
    traceService.getConversationTracePeek.mockResolvedValue({
      conversation: { id: 'c1', provider: 'x', model: 'y', createdAt: '2026-08-31T00:00:00Z', lastActivityAt: '2026-08-31T01:00:00Z' },
      steps: [{ id: 'tool-1', type: 'tool_call', time: '2026-08-31T00:30:00Z', toolName: 'analyze_customer_risk', businessEvent: 'CustomerRiskAssessed', evidence: '{"decision":"high"}' }],
    });
    opService.findByTargetId.mockResolvedValue([
      { id: 9, action: 'CREATE', method: 'POST', path: '/api/v1/crm/tasks', createdAt: new Date('2026-08-31T02:00:00Z'), changes: '[{"field":"status"}]', businessEvent: 'TaskCreated', userId: 1 },
    ]);
    entityManager.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 42, title: '跟进', status: 'open' }),
    });

    const res = await service.historyForEntity('crm_task', 42, '1', true);

    expect(res.events).toHaveLength(3);
    expect(res.events.map((e) => e.source)).toEqual(['ai-trace', 'ai-side-effect', 'rest-write']);
    expect(res.events[0]).toMatchObject({ source: 'ai-trace', businessEvent: 'CustomerRiskAssessed' });
    expect(res.events[1]).toMatchObject({ source: 'ai-side-effect', toolName: 'create_followup_task', after: expect.stringContaining('跟进') });
    expect(res.events[2]).toMatchObject({ source: 'rest-write', method: 'POST', changes: '[{"field":"status"}]' });
    expect(res.target).toMatchObject({ exists: true, title: '跟进', status: 'open' });
  });

  it('非 owner 且非 admin → 403', async () => {
    effectsService.findManyByTarget.mockResolvedValue([]);
    entityManager.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 42, userId: '2' }),
    });
    await expect(service.historyForEntity('crm_task', 42, '1', false)).rejects.toThrow('无权访问');
  });

  it('owner 放行（副作用 userId === viewer）', async () => {
    effectsService.findManyByTarget.mockResolvedValue([
      { id: 1, userId: '1', toolName: 'create_followup_task', resultType: 'crm_task', resultId: 42, conversationId: null, createdAt: new Date('2026-08-31T01:00:00Z'), beforeSnapshot: null, afterSnapshot: null },
    ]);
    traceService.getConversationTracePeek.mockResolvedValue(null);
    opService.findByTargetId.mockResolvedValue([]);
    entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    const res = await service.historyForEntity('crm_task', 42, '1', false);
    expect(res.events).toHaveLength(1);
    expect(res.events[0].source).toBe('ai-side-effect');
  });

  it('rest 资源正则：跨资源 id 碰撞防护（findByTargetId 收到 path 子串）', async () => {
    effectsService.findManyByTarget.mockResolvedValue([]);
    opService.findByTargetId.mockResolvedValue([]);
    entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    await service.historyForEntity('crm_task', 42, '1', true);
    expect(opService.findByTargetId).toHaveBeenCalledWith('42', ['/crm/tasks/']);
  });

  // A8 (cross-user evidence mixing): `proxy_call`'s result id is a hash of tool name + args, with no
  // user dimension, so two users calling the same tool with the same arguments land on one
  // resultType+resultId. Authorization admitted a viewer who merely owned *a* row there, then
  // returned *every* row — the other user's side effect (and its snapshot), the other user's
  // conversation trace, and the other user's REST write. The predicate now decides the visible set.
  // These cases fail against the previous implementation: it returned both rows, peeked both
  // conversations, and kept both REST writes.
  //
  // A8（跨用户证据混入）：`proxy_call` 的结果 id 是「工具名 + 参数」的哈希，不含用户维度，
  // 于是两个用户同参数调用会落在同一个 resultType+resultId 上。授权曾放行「在那上面有自己一行」
  // 的人，然后返回**全部**行——他人的副作用（及其快照）、他人的会话轨迹、他人的 REST 写。
  // 现在由判据决定可见集合。以下用例对旧实现为红：旧实现返回两行、peek 两个会话、保留两条 REST 写。
  it('A8：非所有者（proxy_call 等无本地实体者）只看到自己的行', async () => {
    effectsService.findManyByTarget.mockResolvedValue([
      { id: 1, userId: '1', toolName: 'wire_transfer', resultType: 'proxy_call', resultId: 777, conversationId: 'mine', createdAt: new Date('2026-09-25T01:00:00Z'), beforeSnapshot: null, afterSnapshot: null },
      { id: 2, userId: '2', toolName: 'wire_transfer', resultType: 'proxy_call', resultId: 777, conversationId: 'theirs', createdAt: new Date('2026-09-25T02:00:00Z'), beforeSnapshot: '{"secret":"other-user"}', afterSnapshot: null },
    ]);
    traceService.getConversationTracePeek.mockResolvedValue(null);
    opService.findByTargetId.mockResolvedValue([
      { id: 9, action: 'CREATE', method: 'POST', path: '/x', createdAt: new Date('2026-09-25T03:00:00Z'), userId: 2 },
      { id: 10, action: 'CREATE', method: 'POST', path: '/x', createdAt: new Date('2026-09-25T04:00:00Z'), userId: 1 },
    ]);
    // entityFor('proxy_call') → null ⇒ _ownerOf 恒 null ⇒ viewer 不是实体所有者
    entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

    const res = await service.historyForEntity('proxy_call', 777, '1', false);

    const effects = res.events.filter((e) => e.source === 'ai-side-effect');
    expect(effects).toEqual([expect.objectContaining({ effectId: 1, actorId: '1' })]);
    expect(JSON.stringify(res.events)).not.toContain('other-user');
    expect(traceService.getConversationTracePeek).toHaveBeenCalledWith('mine');
    expect(traceService.getConversationTracePeek).not.toHaveBeenCalledWith('theirs');
    expect(res.events.filter((e) => e.source === 'rest-write').map((e) => e.actorId)).toEqual(['1']);
  });

  // The counterweight, so the fix cannot quietly over-tighten: an entity's owner still sees the whole
  // history of that entity, including rows written by other users. Passes before and after — it
  // witnesses the boundary, not the change.
  //
  // 反向对照，防修复顺手收紧过头：实体所有者仍看到该实体的完整行为史，含他人写下的行。
  // 修复前后都为绿——它见证的是边界，不是本次改动。
  it('A8 反向对照：实体所有者仍看到全部行（含他人）', async () => {
    effectsService.findManyByTarget.mockResolvedValue([
      { id: 1, userId: '1', toolName: 'create_followup_task', resultType: 'crm_task', resultId: 42, conversationId: null, createdAt: new Date('2026-09-25T01:00:00Z'), beforeSnapshot: null, afterSnapshot: null },
      { id: 2, userId: '2', toolName: 'create_followup_task', resultType: 'crm_task', resultId: 42, conversationId: null, createdAt: new Date('2026-09-25T02:00:00Z'), beforeSnapshot: null, afterSnapshot: null },
    ]);
    traceService.getConversationTracePeek.mockResolvedValue(null);
    opService.findByTargetId.mockResolvedValue([]);
    entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 42, userId: '1' }) });

    const res = await service.historyForEntity('crm_task', 42, '1', false);
    expect(res.events).toHaveLength(2);
  });
});
