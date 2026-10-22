// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from '../../governance-shared/entities/ai-audit-log.entity';
import { ConversationService, ConversationData } from '../conversation/conversation.service';
import { AiToolEffectsService } from '../../governance-shared/services/ai-tool-effects.service';
import { DecisionTraceService } from './decision-trace.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('C-4(c)：被拒行带结构化 `tool` 列 → 工具名取自该列，回落解析 detail 只对旧行适用', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    // 被拒的 tool_call：authorization 是拒绝 checks 数组；`tool` 列答「是哪个工具被拒」；
    // `detail` 是另一实现的文法（`<tool> <词> …`，无 `(`）——解析不出工具名。
    auditRepo.find.mockResolvedValue([
      log({
        id: 13,
        action: 'tool_call',
        detail: 'delete_customer 删除客户',
        isError: true,
        errorMessage: 'blocked (risk level R5)',
        authorization: JSON.stringify([{ name: 'risk_policy', ok: false }]),
        tool: 'delete_customer',
      }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0].toolName).toBe('delete_customer');
    // 拒绝原因仍从 authorization 快照读（与工具名的来源互不影响）
    expect(steps[0].checks).toEqual([{ name: 'risk_policy', ok: false }]);
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

  // run 级确认：轨迹仍以**原文**充当工具名（本文件既有取舍：宁可显示原文也不显示空），但 outcome 必须是
  // 真读数 —— 旧实现两份正则都匹配不上 run 形状，于是已批准的 run 显示成 timeout。本用例对旧实现为红。
  it('tool_confirmation（run 级）：outcome 取真读数，工具名回落原文', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 15, action: 'tool_confirmation', detail: 'run(3f2a1c8e-0b7d-4a11-9c3e-2f5b6a7d8e9f) 3 items → approve' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0]).toMatchObject({
      type: 'confirmation',
      outcome: 'approve',
      toolName: 'run(3f2a1c8e-0b7d-4a11-9c3e-2f5b6a7d8e9f) 3 items → approve',
      trusted: false,
    });
  });

  // R4 转人工审批：旧读法塌成 timeout，轨迹于是显示「已超时」而该行自己写的是 pending_approval。
  // 本用例对旧实现为红。
  it('tool_confirmation（R4 转人工审批）：outcome 取真读数，不塌成 timeout', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    auditRepo.find.mockResolvedValue([
      log({ id: 16, action: 'tool_confirmation', detail: 'create_event({"title":"m"}) → pending_approval' }),
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0]).toMatchObject({ type: 'confirmation', toolName: 'create_event', outcome: 'pending_approval' });
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
        // listForConversation 恒下发服务端单一权威的 revocable + status（decision-trace 不再自算）
        revocable: true,
        status: 'executed',
      },
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 'effect-9',
      type: 'effect',
      toolName: 'create_event',
      effect: {
        effectId: 9,
        resultType: 'event',
        resultId: 7,
        targetTitle: 'meeting',
        revocable: true,
        status: 'executed',
      },
    });
  });

  // The trace must not own a second status rule. These inputs are deliberately inconsistent with
  // each other: the projection says `revoked`, while the target flag and `revocable` still read as
  // live. Re-deriving status here would flip it back to `executed`; passthrough keeps the reading.
  //
  // 轨迹不得拥有第二套状态规则。这里的输入彼此刻意不一致：投影说 `revoked`，而目标软删标志与
  // `revocable` 仍读作存活。在这里重算会把状态翻回 `executed`；原样透传才能保住读数。
  it('effect 步骤：status 原样透传，不由 trace 用 targetSoftDeleted / revocable 重算', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    effectsService.listForConversation.mockResolvedValue([
      {
        id: 20,
        toolName: 'create_event',
        conversationId: 'conv-1',
        resultType: 'event',
        resultId: 8,
        argsHash: 'abc',
        createdAt: '2026-08-18T01:03:00.000Z',
        targetExists: true,
        targetSoftDeleted: false,
        targetTitle: 'x',
        revocable: true,
        status: 'revoked',
      },
    ]);

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    expect(steps[0].effect).toMatchObject({ status: 'revoked', revocable: true });
  });

  // This is the reason the field exists: the front end used to join a separate newest-first list
  // (requested with limit=100; the endpoint itself caps the page at 50), so an older effect had no
  // label. The trace has no such cap — every effect for the conversation carries its own status,
  // including the oldest one.
  //
  // 这正是该字段存在的理由：前端原先去 join 一份「按时间倒序」的清单（请求 limit=100，而端点
  // 自身把每页压到 50），更旧的副作用因此没有标注。trace 没有这个上限 —— 会话里的每一条副作用
  //（包括最旧的一条）都带自己的状态。
  it('effect 步骤：101 条副作用全部带 status（不依赖 my/tool-effects 的分页）', async () => {
    convService.getConversation.mockResolvedValue(makeConv());
    effectsService.listForConversation.mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({
        id: i + 1,
        toolName: 'create_event',
        conversationId: 'conv-1',
        resultType: 'event',
        resultId: 1000 + i,
        argsHash: 'abc',
        createdAt: new Date(Date.UTC(2026, 7, 18, 1, 0, i)).toISOString(),
        targetExists: true,
        targetSoftDeleted: i === 0,
        targetTitle: `t${i}`,
        revocable: i !== 0,
        status: i === 0 ? 'revoked' : 'executed',
      })),
    );

    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    const effectSteps = steps.filter((s) => s.type === 'effect');
    expect(effectSteps).toHaveLength(101);
    expect(effectSteps.every((s) => typeof s.effect?.status === 'string')).toBe(true);
    // Oldest row (id 1) would fall outside a newest-first 100-row page; it still carries `revoked`.
    expect(effectSteps[0].effect).toMatchObject({ effectId: 1, status: 'revoked' });
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

  it('② 绑定：每步键集 ⊆ trace-step 冻结契约（无越界键）', async () => {
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
      log({ id: 33, action: 'chat', model: 'deepseek-v4-flash', promptTokens: 10, completionTokens: 5, createdAt: new Date('2026-08-18T01:05:00.000Z') }),
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
        beforeSnapshot: null,
        afterSnapshot: null,
      } as unknown as never,
    ]);
    const { steps } = await service.getConversationTrace('conv-1', '42', ability);
    // 版本由 registry 决定、**不硬编码** —— 契约只增不改，形状变更后 registry 指向 vN；
    // 硬编码 v1 会让本断言对着**过期契约**静默通过（2026-10-03 trace-step 出 v2 时发现）。
    const specs = resolve(__dirname, '../../../specs/protocol');
    const registry = JSON.parse(readFileSync(resolve(specs, 'wire-schema-registry-v2.json'), 'utf8')) as {
      schemasDir: string;
      objects: Array<{ id: string; version: string; schema: string }>;
    };
    const traceStepSchema = registry.objects.find((o) => o.id === 'trace-step');
    if (!traceStepSchema) throw new Error('registry 缺 trace-step 条目');
    const props = Object.keys(
      (
        JSON.parse(
          readFileSync(resolve(specs, registry.schemasDir, traceStepSchema.version, traceStepSchema.schema), 'utf8'),
        ) as { properties: Record<string, unknown> }
      ).properties,
    );
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(Object.keys(s).filter((k) => !props.includes(k))).toEqual([]);
  });
});
