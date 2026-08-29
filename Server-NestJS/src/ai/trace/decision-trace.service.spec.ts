import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from '../audit/ai-audit-log.entity';
import { ConversationService, ConversationData } from '../conversation/conversation.service';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { DecisionTraceService } from './decision-trace.service';

function makeAuditRepo() {
  return { find: jest.fn().mockResolvedValue([]) };
}

function makeConv(overrides: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-1',
    userId: '42',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    messages: [],
    createdAt: '2026-08-18T01:00:00.000Z',
    lastActivityAt: '2026-08-18T01:05:00.000Z',
    ...overrides,
  };
}

function log(overrides: Partial<AiAuditLog>): AiAuditLog {
  return {
    id: 1,
    userId: '42',
    conversationId: 'conv-1',
    action: 'chat',
    detail: null,
    isError: false,
    createdAt: new Date('2026-08-18T01:02:00.000Z'),
    ...overrides,
  } as AiAuditLog;
}

describe('DecisionTraceService', () => {
  let service: DecisionTraceService;
  let auditRepo: ReturnType<typeof makeAuditRepo>;
  let convService: { getConversation: jest.Mock };
  let effectsService: { listForConversation: jest.Mock };
  const ability = { cannot: jest.fn() } as never;

  beforeEach(async () => {
    auditRepo = makeAuditRepo();
    convService = { getConversation: jest.fn() };
    effectsService = { listForConversation: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionTraceService,
        { provide: getRepositoryToken(AiAuditLog), useValue: auditRepo },
        { provide: ConversationService, useValue: convService },
        { provide: AiToolEffectsService, useValue: effectsService },
      ],
    }).compile();
    service = moduleRef.get(DecisionTraceService);
  });

  it('所有权/存在性：ConversationService 抛 403/404 时透传', async () => {
    convService.getConversation.mockRejectedValue(new ForbiddenException('无权访问此对话'));
    await expect(service.getConversationTrace('conv-1', '42', ability)).rejects.toThrow(ForbiddenException);

    convService.getConversation.mockRejectedValue(new NotFoundException('Conversation not found'));
    await expect(service.getConversationTrace('conv-x', '42', ability)).rejects.toThrow(NotFoundException);
  });

  it('用 conversationId 查询审计与副作用，并透传对话元数据', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    const result = await service.getConversationTrace('conv-1', '42', ability);

    expect(auditRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'conv-1' }) }),
    );
    expect(effectsService.listForConversation).toHaveBeenCalledWith('conv-1');
    expect(result.conversation.id).toBe('conv-1');
    expect(result.conversation.provider).toBe('deepseek');
    expect(result.steps).toEqual([]);
  });

  it('tool_call 解析：detail `name(args)` 拆出工具名与参数，成功态', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 11, action: 'tool_call', detail: 'create_event({"title":"meeting","date":"2026-08-19"})' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 'tool-11',
      type: 'tool_call',
      toolName: 'create_event',
      args: '{"title":"meeting","date":"2026-08-19"}',
      success: true,
    });
  });

  it('tool_call 失败：isError → success=false + errorMessage', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 12, action: 'tool_call', detail: 'query_events({"start":"x"})', isError: true, errorMessage: 'bad date' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0]).toMatchObject({ type: 'tool_call', success: false, errorMessage: 'bad date' });
  });

  it('tool_confirmation 解析：outcome + trusted 标志', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 13, action: 'tool_confirmation', detail: 'create_event({"title":"m"}) → approve (trusted)' }),
      log({ id: 14, action: 'tool_confirmation', detail: 'create_todo({"text":"x"}) → decline' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0]).toMatchObject({ type: 'confirmation', toolName: 'create_event', outcome: 'approve', trusted: true });
    expect(steps[1]).toMatchObject({ type: 'confirmation', toolName: 'create_todo', outcome: 'decline', trusted: false });
  });

  it('effect 步骤：透传富化后的副作用信息', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    effectsService.listForConversation.mockResolvedValue([
      {
        id: 9,
        toolName: 'create_event',
        conversationId: 'conv-1',
        resultType: 'event',
        resultId: 7,
        argsHash: 'abc',
        createdAt: '2026-08-18T01:03:00.000Z',
        targetExists: true,
        targetSoftDeleted: false,
        targetTitle: 'meeting',
      },
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 'effect-9',
      type: 'effect',
      toolName: 'create_event',
      effect: { effectId: 9, resultType: 'event', resultId: 7, targetTitle: 'meeting', revocable: true },
    });
  });

  it('E-1：effect 步骤透出 before/after 快照', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    effectsService.listForConversation.mockResolvedValue([
      {
        id: 10,
        toolName: 'create_followup_task',
        conversationId: 'conv-1',
        resultType: 'crm_task',
        resultId: 3,
        argsHash: 'abc',
        createdAt: '2026-08-18T01:04:00.000Z',
        targetExists: true,
        targetSoftDeleted: false,
        targetTitle: '跟进',
        beforeSnapshot: null,
        afterSnapshot: '{"id":3,"title":"跟进","status":"open"}',
      },
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0].effect).toMatchObject({
      resultType: 'crm_task',
      before: null,
      after: '{"id":3,"title":"跟进","status":"open"}',
    });
  });

  it('消息合并：user→input、非空 assistant→assistant、tool/system/空内容→跳过', async () => {
    convService.getConversation.mockResolvedValue(
      makeConv({
        messages: [
          { role: 'system', content: 'You are an assistant.', timestamp: '2026-08-18T01:01:00.000Z' },
          { role: 'user', content: '帮我创建一个事件', timestamp: '2026-08-18T01:01:00.100Z' },
          { role: 'assistant', content: '', timestamp: '2026-08-18T01:01:00.200Z' }, // tool_calls 占位，跳过
          { role: 'tool', content: '{"success":true}', timestamp: '2026-08-18T01:01:00.300Z' },
          { role: 'assistant', content: '已创建', timestamp: '2026-08-18T01:01:00.400Z' },
        ],
      }),
    );

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    const types = steps.map((s) => s.type);
    expect(types).toEqual(['input', 'assistant']);
    expect(steps[0]).toMatchObject({ id: 'msg-1', type: 'input', content: '帮我创建一个事件' });
    expect(steps[1]).toMatchObject({ id: 'msg-4', type: 'assistant', content: '已创建' });
  });

  it('notice 步骤：chat 审计带 model/tokens/success，error 审计带错误信息', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 21, action: 'chat', model: 'deepseek-v4-flash', provider: 'deepseek', promptTokens: 100, completionTokens: 50 }),
      log({ id: 22, action: 'error', isError: true, errorMessage: 'boom' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0]).toMatchObject({ id: 'log-21', type: 'notice', model: 'deepseek-v4-flash', tokens: 150, success: true });
    expect(steps[1]).toMatchObject({ id: 'log-22', type: 'notice', success: false, errorMessage: 'boom' });
  });

  it('步骤按时间升序排序（消息 + 审计 + 副作用混合）', async () => {
    convService.getConversation.mockResolvedValue(
      makeConv({
        messages: [
          { role: 'user', content: '创建明天的事件', timestamp: '2026-08-18T01:01:00.000Z' },
          { role: 'assistant', content: '已创建', timestamp: '2026-08-18T01:04:00.000Z' },
        ],
      }),
    );
    auditRepo.find.mockResolvedValue([
      log({ id: 31, action: 'tool_call', detail: 'create_event({"title":"x"})', createdAt: new Date('2026-08-18T01:02:00.000Z') }),
      log({ id: 32, action: 'tool_confirmation', detail: 'create_event({}) → approve', createdAt: new Date('2026-08-18T01:02:10.000Z') }),
    ]);
    effectsService.listForConversation.mockResolvedValue([
      {
        id: 3,
        toolName: 'create_event',
        conversationId: 'conv-1',
        resultType: 'event',
        resultId: 7,
        argsHash: 'a',
        createdAt: '2026-08-18T01:03:00.000Z',
        targetExists: true,
        targetSoftDeleted: false,
        targetTitle: 'x',
      },
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps.map((s) => s.type)).toEqual(['input', 'tool_call', 'confirmation', 'effect', 'assistant']);
  });
});
