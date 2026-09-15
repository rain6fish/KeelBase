// SPDX-License-Identifier: Apache-2.0

import { summarizeAudit, aggregateConversation, explainAuthorization, replayKey } from './audit-interpreter.service';

describe('Audit Interpreter（§internal.16 A-4 审计解释器）', () => {
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

  it('A-8 越权尝试：errorMessage 无权/越权 → 「越权尝试」业务摘要', () => {
    const s = summarizeAudit(
      { userId: '1', username: 'alex', action: 'tool_call', detail: 'query_customers({})', isError: true, errorMessage: '无权访问此客户' },
      [],
    );
    expect(s.sentence).toContain('越权尝试');
    expect(s.sentence).toContain('受限数据');
  });

  it('A-8 高风险阻断：R5 blocked → 「高风险操作」摘要', () => {
    const s = summarizeAudit(
      { userId: '1', username: 'alex', action: 'tool_call', detail: 'delete_customer({})', isError: true, errorMessage: 'Tool "delete_customer" is blocked (risk level R5)' },
      [],
    );
    expect(s.sentence).toContain('高风险操作');
    expect(s.sentence).toContain('阻断');
  });

  it('A-8 门控拒绝：治理禁用 → 通用「安全策略阻断」摘要', () => {
    const s = summarizeAudit(
      { userId: '1', username: 'alex', action: 'tool_call', detail: 'generate_image({})', isError: true, errorMessage: '工具被治理策略禁用' },
      [],
    );
    expect(s.sentence).toContain('安全策略阻断');
    expect(s.sentence).not.toContain('越权尝试');
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

describe('D-3 人读「决策说明」（explainAuthorization）', () => {
  const allowRow = (over: Record<string, unknown> = {}) => ({
    userId: '42',
    username: 'alex',
    action: 'tool_call',
    detail: 'create_followup_task({"customerId":7})',
    authorization: JSON.stringify({
      allowed: true,
      tool: 'create_followup_task',
      role: 'user',
      riskLevel: 'R3',
      strategy: 'confirmation',
      checks: [
        { name: 'user_scoped', ok: true, note: '仅本人数据' },
        { name: 'email_verified', ok: true },
      ],
      policy: { revision: 'ab12cd34ef56', updatedAt: '2026-09-04T09:20:00.000Z' },
      ...over,
    }),
  });

  it('允许：句含角色/范围/策略版本/检查，key=authz.allow', () => {
    const n = explainAuthorization(allowRow());
    expect(n.decision).toBe('allow');
    expect(n.key).toBe('authz.allow');
    expect(n.sentence).toContain('允许');
    expect(n.sentence).toContain('角色=user');
    expect(n.sentence).toContain('范围=user_scoped（仅本人数据）');
    expect(n.sentence).toContain('策略版本=ab12cd34ef56');
    expect(n.sentence).toContain('2026-09-04T09:20:00.000Z');
    expect(n.sentence).toContain('user_scoped✓');
    expect(n.role).toBe('user');
    expect(n.policyRevision).toBe('ab12cd34ef56');
    expect(n.failedChecks).toEqual([]);
  });

  it('拒绝：数组快照（reasons）→ 未过检查 + 原因，key=authz.deny', () => {
    const row = {
      userId: '42', username: 'alex', action: 'tool_call',
      authorization: JSON.stringify([
        { name: 'role_allowed', ok: false, note: '角色 user 不在白名单' },
        { name: 'user_scoped', ok: true },
      ]),
    };
    const n = explainAuthorization(row);
    expect(n.decision).toBe('deny');
    expect(n.key).toBe('authz.deny');
    expect(n.sentence).toContain('拒绝');
    expect(n.sentence).toContain('role_allowed');
    expect(n.reasons).toContain('角色 user 不在白名单');
    expect(n.failedChecks).toHaveLength(1);
  });

  it('降级：无快照 / 不可解析 → decision=unknown 且句含「未记录」（不推断）', () => {
    for (const auth of [null, undefined, '', '{坏json']) {
      const n = explainAuthorization({ userId: '42', action: 'chat', authorization: auth as string | null });
      expect(n.decision).toBe('unknown');
      expect(n.key).toBe('authz.unknown');
      expect(n.sentence).toContain('未记录');
      expect(n.role).toBeNull();
      expect(n.replay).toBeNull();
    }
  });

  it('回放三态：一致 / 漂移 / 不可回放（无 revision 降级）', () => {
    expect(explainAuthorization(allowRow(), { state: 'consistent' }).sentence).toContain('按当时策略回放：一致');
    expect(explainAuthorization(allowRow(), { state: 'drift' }).sentence).toContain('按当时策略回放：检出漂移');
    const noRev = explainAuthorization(allowRow({ policy: null }));
    expect(noRev.replay).toEqual({ state: 'unavailable', note: '快照未含策略版本' });
    expect(noRev.sentence).toContain('按当时策略回放：不可回放');
    expect(noRev.sentence).not.toContain('策略版本=');
  });

  it('有 revision 但未注入回放结果 → replay=null（本次未计算，不误报）', () => {
    const n = explainAuthorization(allowRow());
    expect(n.replay).toBeNull();
    expect(n.sentence).not.toContain('按当时策略回放');
  });

  it('i18n：语义 key 覆盖 allow/deny/unknown + 回放三态', () => {
    expect(explainAuthorization(allowRow()).key).toBe('authz.allow');
    expect(explainAuthorization({ userId: '1', action: 'x', authorization: '[]' }).key).toBe('authz.deny');
    expect(explainAuthorization({ userId: '1', action: 'x' }).key).toBe('authz.unknown');
    expect(replayKey('consistent')).toBe('authz.replay.consistent');
    expect(replayKey('drift')).toBe('authz.replay.drift');
    expect(replayKey('unavailable')).toBe('authz.replay.unavailable');
  });

  it('summarizeAudit 附决策说明：有快照才附；无快照不附（避免噪音）', () => {
    const withSnap = summarizeAudit(allowRow(), []);
    expect(withSnap.decisionNote?.decision).toBe('allow');
    const without = summarizeAudit({ userId: '1', username: 'a', action: 'chat' }, []);
    expect(without.decisionNote).toBeUndefined();
    expect('decisionNote' in without).toBe(false);
  });

  it('summarizeAudit 注入回放：ctx.replay 透传到决策说明', () => {
    const s = summarizeAudit(allowRow(), [], { replay: { state: 'drift' } });
    expect(s.decisionNote?.replay?.state).toBe('drift');
    expect(s.decisionNote?.sentence).toContain('检出漂移');
  });

  it('确定性：同输入两次 → 同句（非 LLM）', () => {
    expect(explainAuthorization(allowRow()).sentence).toBe(explainAuthorization(allowRow()).sentence);
  });
});
