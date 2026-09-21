// SPDX-License-Identifier: Apache-2.0

import { buildToolCallAudit } from './tool-call-audit';

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
      'detail', 'isError', 'promptTokens', 'provider', 'userId',
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
    });

    expect(row.isError).toBe(true);
    expect(row.businessEvent).toBeUndefined();
    expect(row.evidence).toBeUndefined();
    expect(row.promptTokens).toBeUndefined();
    // deny 行的有值键集：比成功行少 businessEvent/两列 tokens（这正是四处必须同形的原因）
    expect(definedKeys(row)).toEqual([
      'action', 'authorization', 'conversationId', 'detail', 'errorMessage',
      'isError', 'provider', 'userId',
    ]);
  });

  it('B 路径代理写：source 标 bridge；非代理写则无该列', () => {
    expect(buildToolCallAudit({ ...base, bridge: true, result: { success: true } }).source).toBe('bridge');
    expect(buildToolCallAudit({ ...base, result: { success: true } }).source).toBeUndefined();
  });
});
