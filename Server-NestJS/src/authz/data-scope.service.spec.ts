// SPDX-License-Identifier: Apache-2.0

import { DataScopeService } from './data-scope.service';

function makeService(opts: {
  role?: string;
  level?: string | undefined;
  customDeptIds?: number[] | null;
  ctx?: { orgId: number; deptId: number | null } | null;
  subtree?: number[];
  omitRules?: boolean;
}) {
  const users = { findOne: jest.fn().mockResolvedValue({ id: 5, role: opts.role ?? 'user' }) };
  const org = {
    getUserOrgContext: jest.fn().mockResolvedValue(opts.ctx === undefined ? { orgId: 1, deptId: 3 } : opts.ctx),
    listDeptSubtreeIds: jest.fn().mockResolvedValue(opts.subtree ?? [3, 7, 9]),
  };
  const rules = opts.omitRules
    ? undefined
    : {
        dataScopeFor: jest.fn().mockReturnValue(opts.level),
        customDeptIdsFor: jest.fn().mockReturnValue(opts.customDeptIds ?? null),
      };
  return new DataScopeService(users as never, org as never, rules as never);
}

describe('DataScopeService（权限-2 Step 2：按角色配置数据范围）', () => {
  it('无规则来源 → 回退内置默认（Todo=org，CrmCustomer=own）', async () => {
    await expect(makeService({ omitRules: true }).resolve(5, 'Todo')).resolves.toMatchObject({
      level: 'org',
      orgId: 1,
    });
    await expect(makeService({ omitRules: true }).resolve(5, 'CrmCustomer')).resolves.toMatchObject({
      level: 'own',
    });
  });

  it('角色未配置该主体 → 同样回退内置默认', async () => {
    await expect(makeService({ level: undefined }).resolve(5, 'Todo')).resolves.toMatchObject({
      level: 'org',
    });
  });

  it('配置 own_dept_and_below → 下钻子树 id', async () => {
    const svc = makeService({ level: 'own_dept_and_below', subtree: [3, 7, 9] });
    const d = await svc.resolve(5, 'CrmCustomer');
    expect(d.level).toBe('own_dept_and_below');
    expect(d.deptSubtreeIds).toEqual([3, 7, 9]);
  });

  it('配置 custom_dept → 带自定义部门集', async () => {
    const svc = makeService({ level: 'custom_dept', customDeptIds: [4, 5] });
    const d = await svc.resolve(5, 'CrmCustomer');
    expect(d.level).toBe('custom_dept');
    expect(d.customDeptIds).toEqual([4, 5]);
  });

  it('配置 all → level=all（不施加行级条件）', async () => {
    const svc = makeService({ role: 'admin', level: 'all' });
    await expect(svc.resolve(5, 'Todo')).resolves.toMatchObject({ level: 'all' });
  });

  it('非组织成员 → orgId/deptId 为 null，且不触发下钻查询', async () => {
    const svc = makeService({ level: 'own_dept_and_below', ctx: null });
    const d = await svc.resolve(5, 'CrmCustomer');
    expect(d.orgId).toBeNull();
    expect(d.deptSubtreeIds).toEqual([]);
  });
});
