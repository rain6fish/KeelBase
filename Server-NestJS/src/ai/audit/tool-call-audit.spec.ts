// SPDX-License-Identifier: Apache-2.0

import { boundedToolArgs, buildToolCallAudit, confirmationOutcome, TOOL_ARGS_COLUMN_MAX } from './tool-call-audit';

/**
 * `tool_call` 审计行组装单测（阶段 3 第十二刀新增——此前四处内联字面量**没有直接覆盖**，
 * 只有穿 chat/chatStream 的集成级断言；而本模块存在的理由正是「字段集别再漂移」，故逐形钉住）。
 */
describe('buildToolCallAudit（tool_call 审计行）', () => {
  const base = {
    userId: '7',
    conversationId: 'conv-1',
    provider: 'deepseek',
    toolName: 'create_event',
    argsJson: '{"title":"评审"}',
    bridge: false,
  };

  /** 有值的键（undefined 的键在落库时是 NULL，等于没写） */
  const definedKeys = (o: Record<string, unknown>) =>
    Object.keys(o).filter((k) => o[k] !== undefined).sort();

  it('成功且放行：取结果里的用量 / 业务事件 / 决策证据，透传授权快照', () => {
    const row = buildToolCallAudit({
      ...base,
      result: { success: true, data: { id: 1 }, usage: { promptTokens: 12, completionTokens: 3 } },
      authorization: '{"checks":[]}',
    });

    expect(row).toMatchObject({
      userId: '7',
      conversationId: 'conv-1',
      action: 'tool_call',
      detail: 'create_event({"title":"评审"})', // 原文参数串，不重新序列化
      isError: false,
      provider: 'deepseek',
      promptTokens: 12,
      completionTokens: 3,
      businessEvent: 'EventCreated',
      authorization: '{"checks":[]}',
    });
    expect(definedKeys(row)).toEqual([
      'action', 'authorization', 'businessEvent', 'completionTokens', 'conversationId',
      'detail', 'isError', 'outcome', 'promptTokens', 'provider', 'tool', 'toolArgs', 'userId',
    ]);
  });

  it('执行失败：isError 真、错误文案取结果里的 error（deny 才由调用方给文案）', () => {
    const row = buildToolCallAudit({ ...base, result: { success: false, error: 'boom' } });

    expect(row.isError).toBe(true);
    expect(row.errorMessage).toBe('boom');
    expect(row.promptTokens).toBeUndefined();
  });

  it('R4 待批：已提交人工审批**不算失败**（否则单次审批被计三重误报）', () => {
    const row = buildToolCallAudit({
      ...base,
      result: { success: false, error: '已提交人工审批' },
      pendingApproval: true,
    });

    expect(row.isError).toBe(false);
    expect(row.errorMessage).toBe('已提交人工审批');
  });

  it('未执行（deny / 待批）：无结果 → isError 真，且**不派生**业务事件与决策证据', () => {
    const row = buildToolCallAudit({
      ...base,
      errorMessage: 'Tool "delete_customer" is blocked (risk level R5)',
      authorization: '[{"name":"risk_policy","ok":false}]',
      deniedBy: ['risk_policy'],
    });

    expect(row.isError).toBe(true);
    expect(row.businessEvent).toBeUndefined();
    expect(row.evidence).toBeUndefined();
    expect(row.promptTokens).toBeUndefined();
    // C-3：文案与结果码说的是同一件事 —— 这道闸是风险策略，故 blocked（不是 refused）
    expect(row.outcome).toBe('blocked');
    // deny 行的有值键集：比成功行少 businessEvent/两列 tokens（这正是四处必须同形的原因）
    expect(definedKeys(row)).toEqual([
      'action', 'authorization', 'conversationId', 'detail', 'errorMessage',
      'isError', 'outcome', 'provider', 'tool', 'toolArgs', 'userId',
    ]);
  });

  it('P0-19：「做了什么」落在自己的列上（原文参数串原样，不重新序列化）', () => {
    const row = buildToolCallAudit({ ...base, result: { success: true } });
    expect(row.toolArgs).toBe('{"title":"评审"}');
    // 半截 JSON 什么也答不出，还会假装可解析 —— 超限**留空**，不截断
    const huge = JSON.stringify({ blob: 'x'.repeat(TOOL_ARGS_COLUMN_MAX) });
    expect(buildToolCallAudit({ ...base, argsJson: huge, result: { success: true } }).toolArgs).toBeUndefined();
    expect(boundedToolArgs('')).toBeUndefined();
    expect(boundedToolArgs(undefined)).toBeUndefined();
  });

  it('C-3：结果码按形状取值 —— 两种执行、待批优先于失败、两道闸分得开、工具名原样透传', () => {
    // 执行：成功 / 失败
    expect(buildToolCallAudit({ ...base, result: { success: true } }).outcome).toBe('executed');
    expect(buildToolCallAudit({ ...base, result: { success: false, error: 'boom' } }).outcome).toBe('failed');
    // R4 待批：调用方**同时**给了 result（占位失败）与 pendingApproval ⇒ 在等人是 pending，不是 failed
    expect(
      buildToolCallAudit({ ...base, result: { success: false, error: '已提交人工审批' }, pendingApproval: true }).outcome,
    ).toBe('pending');
    // 两道闸：risk_policy 那道**没到裁决** ⇒ blocked；其余拒绝 ⇒ refused
    expect(
      buildToolCallAudit({ ...base, errorMessage: 'blocked (R5)', deniedBy: ['risk_policy'] }).outcome,
    ).toBe('blocked');
    expect(
      buildToolCallAudit({ ...base, errorMessage: 'not your data', deniedBy: ['role_allowed'] }).outcome,
    ).toBe('refused');
    // 没有结构化的 reasons（如子代理越出自己工具集）⇒ refused —— 不从文案里猜哪道闸
    expect(buildToolCallAudit({ ...base, errorMessage: 'outside this agent tool set' }).outcome).toBe('refused');
    // tool 列：产出方自己的注册名，不解析 detail
    expect(buildToolCallAudit({ ...base, result: { success: true } }).tool).toBe('create_event');
  });

  it('C-3：确认行的裁决 → 词表值（run 级与单条共用同一处映射）', () => {
    expect(confirmationOutcome('approve')).toBe('approved');
    expect(confirmationOutcome('decline')).toBe('declined');
    expect(confirmationOutcome('timeout')).toBe('timeout');
  });

  it('B 路径代理写：source 标 bridge；非代理写则无该列', () => {
    expect(buildToolCallAudit({ ...base, bridge: true, result: { success: true } }).source).toBe('bridge');
    expect(buildToolCallAudit({ ...base, result: { success: true } }).source).toBeUndefined();
  });

  it('§22.19 AU-2：parentActionId 原样透传（一次委托的分组句柄）；不传则不写该列', () => {
    expect(
      buildToolCallAudit({ ...base, result: { success: true }, parentActionId: 'run-1' }).parentActionId,
    ).toBe('run-1');
    // 不传 ⇒ undefined ⇒ 落库为 NULL：主链路四处调用点因此逐字不变
    expect(
      buildToolCallAudit({ ...base, result: { success: true } }).parentActionId,
    ).toBeUndefined();
  });
});
