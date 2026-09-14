// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_FLOW_DEFINITIONS } from './default-definitions';

/**
 * 内建流程定义是启动时注册进运行时的**数据契约**——若 then/else/next 指向不存在的节点，
 * 流程一跑就断链（启动期 upsert 不校验拓扑）。这里做静态一致性校验。
 */
describe('DEFAULT_FLOW_DEFINITIONS（内建流程定义）', () => {
  it('含请假审批与组织申请审批两个定义', () => {
    const ids = DEFAULT_FLOW_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain('leave_approval');
    expect(ids).toContain('org_request_approval');
  });

  it('定义 id 唯一', () => {
    const ids = DEFAULT_FLOW_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个流程至少一个节点，且节点 id 在流程内唯一', () => {
    for (const def of DEFAULT_FLOW_DEFINITIONS) {
      expect(def.nodes.length).toBeGreaterThan(0);
      const nodeIds = def.nodes.map((n) => n.id);
      expect(new Set(nodeIds).size).toBe(nodeIds.length);
    }
  });

  it('condition 节点的 then/else 必须指向本流程内存在的节点', () => {
    for (const def of DEFAULT_FLOW_DEFINITIONS) {
      const ids = new Set(def.nodes.map((n) => n.id));
      for (const node of def.nodes as Array<Record<string, any>>) {
        if (node.type !== 'condition') continue;
        expect(ids.has(node.then)).toBe(true);
        expect(ids.has(node.else)).toBe(true);
      }
    }
  });

  it('human_task 的 next（若有）必须指向本流程内存在的节点', () => {
    for (const def of DEFAULT_FLOW_DEFINITIONS) {
      const ids = new Set(def.nodes.map((n) => n.id));
      for (const node of def.nodes as Array<Record<string, any>>) {
        if (node.type !== 'human_task' || !node.next) continue;
        expect(ids.has(node.next)).toBe(true);
      }
    }
  });

  it('组织申请流程：部门审批后流转到组织审批（assigneeOrgRole 完整）', () => {
    const def = DEFAULT_FLOW_DEFINITIONS.find((d) => d.id === 'org_request_approval')!;
    const dept = def.nodes.find((n) => n.id === 'dept_approve') as Record<string, any>;
    const org = def.nodes.find((n) => n.id === 'org_approve') as Record<string, any>;
    expect(dept.next).toBe('org_approve');
    expect(dept.assigneeOrgRole).toMatchObject({ scope: 'department', role: 'admin' });
    expect(org.assigneeOrgRole).toMatchObject({ scope: 'org', role: 'admin' });
  });
});
