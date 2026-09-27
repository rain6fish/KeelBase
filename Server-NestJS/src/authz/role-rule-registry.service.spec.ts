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

  /**
   * 规则集 = DB 授予 ∪ 构建期种子（`generated-role-rules.ts`，代码即配置：生成模块的所有权规则由
   * `keelbase init` 在构建期写入，部署期无法向 DB 种行）。故断言不能把主体写死成 DB 那一份——每生成
   * 一个模块，种子就多一条。把种子摘掉后剩下的，应当**恰好**是 DB 那一份：既不少（DB 行不许丢），
   * 也不多（DB 不许凭空放大权限）。
   */
  const generatedForUser = () => GENERATED_ROLE_RULES.filter((x) => x.roleCode === 'user');
  const dbOnlySubjects = (r: RoleRuleRegistry): string[] =>
    r
      .rulesFor('user')
      .map((x) => x.subject)
      .filter((s) => !generatedForUser().some((g) => g.subject === s))
      .sort();

  it('rulesFor：按角色还原 CASL 规则（含 ownerField / stringifyOwner）', async () => {
    const r = makeRegistry(roles, grants);
    await r.reload();

    expect(r.rulesFor('admin')).toEqual([{ roleCode: 'admin', subject: 'all', ownerField: null, stringifyOwner: false }]);
    expect(dbOnlySubjects(r)).toEqual(['AiConversation', 'CrmCustomer', 'Todo']);
    expect(r.rulesFor('user').find((x) => x.subject === 'AiConversation')?.stringifyOwner).toBe(true);
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

  it('空表 → 只剩生成模块的种子规则（DB 零贡献，绝不 fail-open）', async () => {
    const r = makeRegistry([], []);
    await r.reload();
    expect(r.rulesFor('user')).toEqual(generatedForUser());
    expect(r.dataScopeFor('user', 'Todo')).toBeUndefined();
  });

  it('跳过孤儿授予（roleId 或 subject 缺失）', async () => {
    const r = makeRegistry(roles, [
      { roleId: 99, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: { subject: 'X' } },
      { roleId: 2, ownerField: 'userId', stringifyOwner: false, dataScope: null, permission: null },
    ]);
    await r.reload();
    expect(r.rulesFor('user')).toEqual(generatedForUser());
  });
});
