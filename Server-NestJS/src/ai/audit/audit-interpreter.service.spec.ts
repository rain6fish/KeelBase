// SPDX-License-Identifier: Apache-2.0

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

  it('A-7 flow_node 审批 → 审批链业务摘要句（发起/通过/驳回/完成）', () => {
    const start = summarizeAudit(
      { userId: '5', username: 'alice', action: 'flow_node', businessEvent: 'FlowInstanceStarted', evidence: JSON.stringify({ definitionId: 'leave_approval', definitionName: '请假审批', event: 'start' }) },
      [],
    );
    expect(start.sentence).toContain('alice');
    expect(start.sentence).toContain('发起流程');
    expect(start.sentence).toContain('请假审批');

    const approve = summarizeAudit(
      { userId: '7', username: 'bob', action: 'flow_node', businessEvent: 'FlowTaskApproved', evidence: JSON.stringify({ nodeId: 'b', nodeName: '经理审批', decision: 'approve', event: 'resolve' }) },
      [],
    );
    expect(approve.sentence).toContain('bob');
    expect(approve.sentence).toContain('审批通过');
    expect(approve.sentence).toContain('经理审批');

    const reject = summarizeAudit(
      { userId: '7', username: 'bob', action: 'flow_node', isError: true, businessEvent: 'FlowTaskRejected', evidence: JSON.stringify({ nodeId: 'b', nodeName: '经理审批', decision: 'reject', event: 'resolve' }) },
      [],
    );
    expect(reject.sentence).toContain('驳回');

    const done = summarizeAudit(
      { userId: '5', username: 'alice', action: 'flow_node', businessEvent: 'FlowInstanceCompleted', evidence: JSON.stringify({ definitionId: 'leave_approval', event: 'completed' }) },
      [],
    );
    expect(done.sentence).toContain('已完成');
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
