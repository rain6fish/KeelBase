import { Test } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { BusinessHistoryService } from './business-history.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { DecisionTraceService } from '../trace/decision-trace.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';

describe('BusinessHistoryService（§22.16 A-2 业务实体行为史）', () => {
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
});
