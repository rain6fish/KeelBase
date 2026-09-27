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

  it('空表 → 每角色以内置为底，生成规则并入而不取代（2026-09-27 事故的回归钉）', async () => {
    const r = makeRegistry([], []);
    await r.reload();
    const subjects = r.rulesFor('user').map((x) => x.subject);
    // The DB contributed nothing, so the built-in rules are that role's floor — the generated rules
    // are then merged on top. Before the fix the registry returned the generated rules *alone* here,
    // which dropped every built-in ownership rule for `user` (a plain user got 403 on their own
    // resources; 28 e2e cases across 11 suites). This assertion is red against that implementation.
    // DB 什么也没贡献 ⇒ 以内置规则为该角色的底，生成规则并上去。修复前这里返回的**只有**生成规则，
    // 于是 `user` 的内置所有权规则整批消失（普通用户在自家资源上 403；e2e 4 片 28 例、11 个套件）。
    // 这条断言对旧实现为红。
    expect(subjects).toContain('Event');
    expect(subjects).toContain('PmProject');
    expect(subjects).toContain('CrmCustomer');
    for (const r0 of GENERATED_ROLE_RULES.filter((x) => x.roleCode === 'user')) {
      expect(subjects.filter((s) => s === r0.subject)).toHaveLength(1); // 并入且不重复
    }
    expect(r.dataScopeFor('user', 'Todo')).toBeUndefined();
  });

  it('DB 对该角色**有**规则时不吃内置（DB 仍是权威：收窄能力没被这次修复拿走）', async () => {
    const r = makeRegistry(roles, grants);
    await r.reload();
    // The fixture grants `user` three subjects only — no Event/Todo/PmProject from the built-ins may
    // creep in, or the per-role floor would have turned "narrowed by the database" into "impossible".
    // 夹具只给 `user` 三条授予 —— 内置的 Event/Todo/PmProject **不得**混进来，否则「每角色回退」就把
    // 「DB 收窄」变成了「收窄不了」。
    const subjects = r.rulesFor('user').map((x) => x.subject);
    expect(subjects).not.toContain('Event');
    expect(subjects).not.toContain('PmProject');
    expect(subjects).toContain('Todo');
    expect(subjects).toContain('CrmCustomer');
  });

  it('跳过孤儿授予（roleId 或 subject 缺失）', async () => {
    const r = makeRegistry(roles, [
      { roleId: 99, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: { subject: 'X' } },
      { roleId: 2, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: null },
    ]);
    await r.reload();
    // Both grants are orphans (unknown roleId / missing subject) and are dropped; `user` then has no
    // DB rules at all, so the built-ins are its floor. An orphan must not reach the ability factory
    // under any name — and the built-in floor must not be mistaken for one.
    // 两条授予都是孤儿（roleId 不认识 / subject 缺失）被丢弃；`user` 于是没有任何 DB 规则 ⇒ 以内置为底。
    // 孤儿不得以任何名义抵达能力工厂 —— 内置的底也不得被误当成孤儿。
    const subjects = r.rulesFor('user').map((x) => x.subject);
    expect(subjects).not.toContain('X');
    expect(subjects).toContain('Event');
  });
});
