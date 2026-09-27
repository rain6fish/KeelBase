// SPDX-License-Identifier: Apache-2.0

import { RoleRuleRegistry } from './role-rule-registry.service';
import { GENERATED_ROLE_RULES } from './generated-role-rules';

function makeRegistry(roles: unknown[], grants: unknown[]) {
  const rolesRepo = { find: jest.fn().mockResolvedValue(roles) };
  const grantsRepo = { find: jest.fn().mockResolvedValue(grants) };
  return new RoleRuleRegistry(rolesRepo as never, grantsRepo as never);
}

describe('RoleRuleRegistry（权限-2 Step 2：规则数据驱动）', () => {
  const roles = [
    { id: 1, code: 'admin', dataScope: 'all', customDeptIds: null },
    { id: 2, code: 'user', dataScope: 'own', customDeptIds: [7, 9] },
  ];
  const grants = [
    { roleId: 1, ownerField: null, stringifyOwner: false, dataScope: null, permission: { subject: 'all' } },
    { roleId: 2, ownerField: 'userId', stringifyOwner: false, dataScope: 'org', permission: { subject: 'Todo' } },
    { roleId: 2, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: { subject: 'CrmCustomer' } },
    { roleId: 2, ownerField: 'userId', stringifyOwner: true, dataScope: null, permission: { subject: 'AiConversation' } },
  ];

  it('rulesFor：按角色还原 CASL 规则（含 ownerField / stringifyOwner）', async () => {
    const r = makeRegistry(roles, grants);
    await r.reload();

    expect(r.rulesFor('admin')).toEqual([{ roleCode: 'admin', subject: 'all', ownerField: null, stringifyOwner: false }]);
    const user = r.rulesFor('user');
    // The DB grants above, plus whatever the generator has written into GENERATED_ROLE_RULES — one
    // entry per generated module. Derived rather than hard-coded for the same reason as the feature-flag
    // list: a generated module would otherwise force an edit here, and the assertion would decay into a
    // rubber stamp. What it pins is that the two sources are merged, and that the DB's per-grant flags
    // (stringifyOwner) survive it.
    //
    // 上面那些 DB 授予，加上生成器写进 GENERATED_ROLE_RULES 的（每个生成模块一条）。推导而非硬写，
    // 理由与 feature-flag 那张清单相同：否则每生成一个模块就得来这里改一次，断言会退化成橡皮图章。
    // 它钉住的是「两个来源被合并」以及 DB 授予上的逐条标志（stringifyOwner）在合并中存活。
    const generatedUserSubjects = GENERATED_ROLE_RULES.filter((x) => x.roleCode === 'user').map(
      (x) => x.subject,
    );
    expect(user.map((x) => x.subject).sort()).toEqual(
      [...new Set(['AiConversation', 'CrmCustomer', 'Todo', ...generatedUserSubjects])].sort(),
    );
    expect(user.find((x) => x.subject === 'AiConversation')?.stringifyOwner).toBe(true);
  });

  it('dataScopeFor：按主体覆盖优先，其次角色默认', async () => {
    const r = makeRegistry(roles, grants);
    await r.reload();

    expect(r.dataScopeFor('user', 'Todo')).toBe('org'); // 覆盖
    expect(r.dataScopeFor('user', 'CrmCustomer')).toBe('own'); // 角色默认
    expect(r.dataScopeFor('admin', 'anything')).toBe('all');
    expect(r.dataScopeFor('nobody', 'Todo')).toBeUndefined();
  });

  it('customDeptIdsFor：取自角色行', async () => {
    const r = makeRegistry(roles, grants);
    await r.reload();
    expect(r.customDeptIdsFor('user')).toEqual([7, 9]);
    expect(r.customDeptIdsFor('admin')).toBeNull();
  });

  it('空表 → 规则为空（工厂据此回退内置常量，绝不 fail-open）', async () => {
    const r = makeRegistry([], []);
    await r.reload();
    // The DB contributed nothing — which is what "the tables are empty" has to mean. The generated
    // rules are a separate, always-on source (code, not rows), so they are what remains.
    // DB 什么也没贡献 —— 这才是「表是空的」该有的含义。生成规则是另一个**常开**来源（是代码、不是行），
    // 所以剩下的正是它们。
    expect(r.rulesFor('user')).toEqual(GENERATED_ROLE_RULES.filter((x) => x.roleCode === 'user'));
    expect(r.dataScopeFor('user', 'Todo')).toBeUndefined();
  });

  it('跳过孤儿授予（roleId 或 subject 缺失）', async () => {
    const r = makeRegistry(roles, [
      { roleId: 99, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: { subject: 'X' } },
      { roleId: 2, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: null },
    ]);
    await r.reload();
    // Both grants are orphans (unknown roleId / missing subject) and are dropped, leaving only the
    // generated rules — an orphan must not reach the ability factory under any name.
    // 两条授予都是孤儿（roleId 不认识 / subject 缺失）被丢弃，只剩生成规则 —— 孤儿不得以任何名义抵达
    // 能力工厂。
    expect(r.rulesFor('user')).toEqual(GENERATED_ROLE_RULES.filter((x) => x.roleCode === 'user'));
  });
});
