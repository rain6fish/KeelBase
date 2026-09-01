// SPDX-License-Identifier: Apache-2.0

import { validateFlowDefinition } from './flow-definition.schema';

describe('validateFlowDefinition', () => {
  it('合法定义通过（condition + human_task + ai_task）', () => {
    const r = validateFlowDefinition({
      id: 'leave_approval',
      name: '请假审批',
      version: '1.0',
      nodes: [
        { id: 'check_days', type: 'condition', name: '天数', expr: '{{days}} > 3', then: 'b', else: 'c' },
        { id: 'b', type: 'human_task', name: '经理审批' },
        { id: 'c', type: 'ai_task', name: 'AI', prompt: '总结' },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('重复节点 id 拒绝', () => {
    const r = validateFlowDefinition({
      id: 'x',
      name: 'x',
      nodes: [
        { id: 'a', type: 'human_task', name: 'a' },
        { id: 'a', type: 'ai_task', name: 'a', prompt: 'p' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('重复');
  });

  it('悬空 next 引用拒绝', () => {
    const r = validateFlowDefinition({
      id: 'x',
      name: 'x',
      nodes: [{ id: 'a', type: 'human_task', name: 'a', next: 'missing' }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('next');
  });

  it('悬空 condition then 拒绝', () => {
    const r = validateFlowDefinition({
      id: 'x',
      name: 'x',
      nodes: [
        { id: 'a', type: 'condition', name: 'c', expr: '{{d}}>1', then: 'gone', else: 'b' },
        { id: 'b', type: 'human_task', name: 'b' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('then');
  });

  it('非法节点 type 拒绝', () => {
    const r = validateFlowDefinition({
      id: 'x',
      name: 'x',
      nodes: [{ id: 'a', type: 'magic', name: 'a' }],
    });
    expect(r.ok).toBe(false);
  });

  it('human_task 缺 assignee 允许（v1 缺省发起人）', () => {
    const r = validateFlowDefinition({
      id: 'x',
      name: 'x',
      nodes: [{ id: 'a', type: 'human_task', name: 'a' }],
    });
    expect(r.ok).toBe(true);
  });
});
