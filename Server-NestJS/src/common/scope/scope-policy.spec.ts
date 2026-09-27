// SPDX-License-Identifier: Apache-2.0

import { defaultScopeDescriptor, registerOrgLevelSubject } from './scope-policy';

describe('defaultScopeDescriptor（Step 1 级别来源，逐 subject 复刻今天的行为）', () => {
  it('Todo / Event + 有组织 → org（等价于 ORG-3 的「本人 OR 同组织」）', () => {
    expect(defaultScopeDescriptor(5, 'Todo', { orgId: 1, deptId: 3 }).level).toBe('org');
    expect(defaultScopeDescriptor(5, 'Event', { orgId: 1, deptId: 3 }).level).toBe('org');
  });

  it('Todo + 无组织 → own', () => {
    expect(defaultScopeDescriptor(5, 'Todo', null).level).toBe('own');
  });

  it('CRM / PM / Approval → own（今天即 owner-only，行为不变）', () => {
    for (const s of ['CrmCustomer', 'PmProject', 'ApprovalRequest']) {
      expect(defaultScopeDescriptor(5, s, { orgId: 1, deptId: 3 }).level).toBe('own');
    }
  });

  it('自登记的 subject（生成模块声明 scope）缺省即 org；未登记的仍是 own', () => {
    registerOrgLevelSubject('Report');

    expect(defaultScopeDescriptor(5, 'Report', { orgId: 1, deptId: 3 }).level).toBe('org');
    // 缺组织信息时仍退回本人 —— 登记只影响「有组织时到哪一级」，不放宽缺信息的情形
    expect(defaultScopeDescriptor(5, 'Report', null).level).toBe('own');
    expect(defaultScopeDescriptor(5, 'Unregistered', { orgId: 1, deptId: 3 }).level).toBe('own');
  });

  it('携带用户与组织上下文（deptSubtreeIds 在 Step 1 恒空）', () => {
    expect(defaultScopeDescriptor(5, 'Todo', { orgId: 1, deptId: 3 })).toMatchObject({
      userId: 5,
      orgId: 1,
      deptId: 3,
      deptSubtreeIds: [],
    });
    expect(defaultScopeDescriptor(5, 'Todo', null)).toMatchObject({
      orgId: null,
      deptId: null,
    });
  });
});
