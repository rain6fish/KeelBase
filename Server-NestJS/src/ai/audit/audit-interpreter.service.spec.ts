import { summarizeAudit, aggregateConversation } from './audit-interpreter.service';

describe('Audit Interpreter（§22.16 A-4 审计解释器）', () => {
  it('analyze_customer_risk：解析 evidence → 业务摘要句（等级/依据数/置信）', () => {
    const row = {
      userId: '1', username: 'alex', action: 'tool_call',
      detail: 'analyze_customer_risk({"id":7})',
      evidence: '{"decision":"high","evidence":["订单降42%","互动超15天"],"policy":"≥10 critical","confidence":0.75}',
    };
    const s = summarizeAudit(row, [row]);
    expect(s.sentence).toContain('alex');
    expect(s.sentence).toContain('high');
    expect(s.sentence).toContain('2条依据');
  });

  it('create_followup_task → 业务事件句', () => {
    const row = { userId: '1', username: 'alex', action: 'tool_call', detail: 'create_followup_task({})', businessEvent: 'FollowupTaskCreated' };
    const s = summarizeAudit(row, [row]);
    expect(s.sentence).toContain('FollowupTaskCreated');
  });

  it('tool_confirmation → 批准句', () => {
    const row = { userId: '1', username: 'alex', action: 'tool_confirmation', detail: 'create_event({}) → approve' };
    const s = summarizeAudit(row, [row]);
    expect(s.sentence).toContain('批准');
  });

  it('坏 evidence JSON → 兜底模板（仍出业务摘要）', () => {
    const row = { userId: '1', username: 'alex', action: 'tool_call', detail: 'analyze_customer_risk({})', evidence: 'not-json' };
    const s = summarizeAudit(row, [row]);
    expect(s.sentence).toContain('风险分析');
  });

  it('content_blocked → 阻断句', () => {
    const row = { userId: '1', username: 'alex', action: 'content_blocked', detail: 'content_safety:sensitive' };
    const s = summarizeAudit(row, [row]);
    expect(s.sentence).toContain('阻断');
  });

  it('aggregateConversation：业务事件计数 + 确认分布 + 阻断', () => {
    const conv = [
      { userId: '1', action: 'tool_call', detail: 'create_followup_task({})', businessEvent: 'FollowupTaskCreated' },
      { userId: '1', action: 'tool_call', detail: 'create_followup_task({})', businessEvent: 'FollowupTaskCreated' },
      { userId: '1', action: 'tool_confirmation', detail: 'create_event({}) → approve' },
      { userId: '1', action: 'tool_call', detail: 'query_evil({})', isError: true, errorMessage: 'blocked (risk level R5)' },
    ];
    const stats = aggregateConversation(conv);
    expect(stats.businessEvents).toEqual([{ event: 'FollowupTaskCreated', count: 2 }]);
    expect(stats.confirmations).toEqual({ approved: 1, declined: 0 });
    expect(stats.blocked).toBe(1);
  });
});
