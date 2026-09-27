// SPDX-License-Identifier: Apache-2.0

import { buildScopeWhere, registerScopeColumns, rowInScope, SCOPE_COLUMNS } from './scope-where';
import type { ScopeDescriptor } from './scope.types';

function desc(over: Partial<ScopeDescriptor> = {}): ScopeDescriptor {
  return { userId: 5, orgId: 1, deptId: 3, level: 'own', deptSubtreeIds: [], ...over };
}

describe('buildScopeWhere（权限-2 结构化 where，不拼 SQL）', () => {
  it('own → 仅本人条件（数组形状与 ORG-3 逐字一致）', () => {
    expect(buildScopeWhere(desc(), 'Todo')).toEqual([{ userId: 5 }]);
  });

  it('org → 本人 OR 同组织（复刻 ORG-3 的 [{userId}] OR [{orgId}]）', () => {
    expect(buildScopeWhere(desc({ level: 'org' }), 'Todo')).toEqual([{ userId: 5 }, { orgId: 1 }]);
  });

  it('own_dept → 本人 OR (组织 + 本部门)', () => {
    expect(buildScopeWhere(desc({ level: 'own_dept' }), 'CrmCustomer')).toEqual([
      { userId: 5 },
      { orgId: 1, deptId: 3 },
    ]);
  });

  it('own_dept_and_below → 部门条件用 In(子树)', () => {
    const w = buildScopeWhere(desc({ level: 'own_dept_and_below', deptSubtreeIds: [3, 7, 9] }), 'CrmCustomer') as any[];
    expect(w[0]).toEqual({ userId: 5 });
    expect(w[1].orgId).toBe(1);
    expect(w[1].deptId.value).toEqual([3, 7, 9]);
  });

  it('custom_dept → 仅自定义部门集（不带 owner 条件）', () => {
    const w = buildScopeWhere(desc({ level: 'custom_dept', customDeptIds: [4, 5] }), 'PmProject') as any[];
    expect(w).toHaveLength(1);
    expect(w[0].deptId.value).toEqual([4, 5]);
  });

  it('all → null（不施加行级约束，由 CASL 粗门承担）', () => {
    expect(buildScopeWhere(desc({ level: 'all' }), 'Todo')).toBeNull();
  });

  it('缺组织/部门信息时一律退回本人（收紧而非放宽）', () => {
    expect(buildScopeWhere(desc({ level: 'org', orgId: null }), 'Todo')).toEqual([{ userId: 5 }]);
    expect(buildScopeWhere(desc({ level: 'own_dept', deptId: null }), 'CrmCustomer')).toEqual([{ userId: 5 }]);
    expect(buildScopeWhere(desc({ level: 'own_dept_and_below', deptSubtreeIds: [] }), 'CrmCustomer')).toEqual([
      { userId: 5 },
    ]);
  });

  it('owner 列因实体而异（ApprovalRequest 用 requesterId）', () => {
    expect(buildScopeWhere(desc(), 'ApprovalRequest')).toEqual([{ requesterId: 5 }]);
  });

  it('登记表恰好覆盖被范围实体', () => {
    expect(Object.keys(SCOPE_COLUMNS).sort()).toEqual([
      'ApprovalRequest',
      'CrmCustomer',
      'Event',
      'PmProject',
      'Todo',
    ]);
  });
});

describe('自登记的 subject（生成模块声明的 scope）', () => {
  it('登记后按其列构造 where —— org 级即「本人或同组织」', () => {
    registerScopeColumns('Report', { owner: 'userId', org: 'orgId', dept: 'deptId' });

    expect(buildScopeWhere(desc({ level: 'org' }), 'Report')).toEqual([{ userId: 5 }, { orgId: 1 }]);
    expect(rowInScope({ userId: 6, orgId: 1 }, desc({ level: 'org' }), 'Report')).toBe(true);
    expect(rowInScope({ userId: 6, orgId: 2 }, desc({ level: 'org' }), 'Report')).toBe(false);
  });

  it('未登记的 subject 只回本人 —— 收紧方向，绝不放宽', () => {
    // 生成模块的自登记没跑（模块没被 import、或那段被删）时的答案：本人的行，仅此而已。
    // 内置五个不会走到这里，故这一支只服务于「登记缺失」，而它给的正是最紧的那个答案。
    //
    // The answer when a generated module's self-registration did not run (module never imported, or
    // that block was deleted): the caller's own rows, nothing more. The built-in five never reach
    // this branch, so it only ever serves a missing registration — with the tightest answer there is.
    expect(buildScopeWhere(desc({ level: 'org' }), 'NeverRegistered')).toEqual([{ userId: 5 }]);
    expect(rowInScope({ userId: 6, orgId: 1 }, desc({ level: 'org' }), 'NeverRegistered')).toBe(false);
    expect(rowInScope({ userId: 5 }, desc({ level: 'org' }), 'NeverRegistered')).toBe(true);
  });

  it('登记不会覆盖内置主体（手写那一半仍有人审、有断言钉住）', () => {
    registerScopeColumns('Todo', { owner: 'somethingElse' });

    expect(buildScopeWhere(desc(), 'Todo')).toEqual([{ userId: 5 }]);
  });
});

describe('rowInScope（对象级，与列表 where 同源）', () => {
  it('owner 命中/不命中', () => {
    expect(rowInScope({ userId: 5 }, desc(), 'Todo')).toBe(true);
    expect(rowInScope({ userId: 6 }, desc(), 'Todo')).toBe(false);
  });

  it('org 级：同组织命中、跨组织与无组织均不命中', () => {
    expect(rowInScope({ userId: 6, orgId: 1 }, desc({ level: 'org' }), 'Todo')).toBe(true);
    expect(rowInScope({ userId: 6, orgId: 2 }, desc({ level: 'org' }), 'Todo')).toBe(false);
    expect(rowInScope({ userId: 6, orgId: null }, desc({ level: 'org' }), 'Todo')).toBe(false);
  });

  it('own_dept_and_below：子树内命中、子树外不命中', () => {
    const d = desc({ level: 'own_dept_and_below', deptSubtreeIds: [3, 7] });
    expect(rowInScope({ userId: 6, orgId: 1, deptId: 7 }, d, 'CrmCustomer')).toBe(true);
    expect(rowInScope({ userId: 6, orgId: 1, deptId: 9 }, d, 'CrmCustomer')).toBe(false);
  });

  it('custom_dept：命中所属部门集', () => {
    const d = desc({ level: 'custom_dept', customDeptIds: [4] });
    expect(rowInScope({ userId: 6, orgId: 1, deptId: 4 }, d, 'PmProject')).toBe(true);
    expect(rowInScope({ userId: 6, orgId: 1, deptId: 5 }, d, 'PmProject')).toBe(false);
  });

  it('all → 一律命中', () => {
    expect(rowInScope({ userId: 99 }, desc({ level: 'all' }), 'Todo')).toBe(true);
  });
});
