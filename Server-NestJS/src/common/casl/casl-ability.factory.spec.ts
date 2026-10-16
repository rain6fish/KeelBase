// SPDX-License-Identifier: Apache-2.0

import { subject } from '@casl/ability';
import { CaslAbilityFactory } from './casl-ability.factory';
import { UserRole } from '../entities/user.entity';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CaslAbilityFactory', () => {
  let factory: CaslAbilityFactory;

  beforeEach(() => {
    factory = new CaslAbilityFactory();
  });

  const regularUser = {
    sub: 1,
    username: 'alice',
    role: UserRole.USER,
  };

  const adminUser = {
    sub: 9,
    username: 'root',
    role: UserRole.ADMIN,
  };

  describe('regular user', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser(regularUser);
    });

    it('can manage own User (id === sub)', () => {
      expect(ability.can('read', subject('User', { id: 1 }))).toBe(true);
      expect(ability.can('update', subject('User', { id: 1 }))).toBe(true);
      expect(ability.can('delete', subject('User', { id: 1 }))).toBe(true);
    });

    it('cannot manage other User', () => {
      expect(ability.can('read', subject('User', { id: 2 }))).toBe(false);
      expect(ability.can('update', subject('User', { id: 2 }))).toBe(false);
    });

    it('can manage own Event (userId === sub)', () => {
      expect(ability.can('read', subject('Event', { userId: 1 }))).toBe(true);
      expect(ability.can('update', subject('Event', { userId: 1 }))).toBe(true);
      expect(ability.can('delete', subject('Event', { userId: 1 }))).toBe(true);
    });

    it('cannot manage other Event', () => {
      expect(ability.can('read', subject('Event', { userId: 2 }))).toBe(false);
      expect(ability.can('delete', subject('Event', { userId: 2 }))).toBe(false);
    });

    it('can manage own AiConversation (userId string === String(sub))', () => {
      expect(ability.can('read', subject('AiConversation', { userId: '1' }))).toBe(true);
      expect(ability.can('delete', subject('AiConversation', { userId: '1' }))).toBe(true);
    });

    it('cannot manage other AiConversation', () => {
      expect(ability.can('read', subject('AiConversation', { userId: '2' }))).toBe(false);
      expect(ability.can('delete', subject('AiConversation', { userId: '2' }))).toBe(false);
    });

    it('cannot manage all', () => {
      expect(ability.can('manage', 'all')).toBe(false);
    });
  });

  describe('admin user', () => {
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser(adminUser);
    });

    it('can manage all', () => {
      expect(ability.can('manage', 'all')).toBe(true);
    });

    it('can read any User and Event', () => {
      expect(ability.can('read', subject('User', { id: 999 }))).toBe(true);
      expect(ability.can('read', subject('Event', { userId: 999 }))).toBe(true);
      expect(ability.can('read', subject('AiConversation', { userId: '999' }))).toBe(true);
    });
  });

  describe('describeForUser (W5-⑦ Explainable Authz)', () => {
    it('admin: role + manage all basis + all scope', () => {
      const d = factory.describeForUser(adminUser);
      expect(d.role).toBe(UserRole.ADMIN);
      expect(d.basis).toContain('管理员');
      const all = d.resources.find((r) => r.subject === 'all');
      expect(all?.scope).toBe('all');
    });

    it('user: own-scoped resources with ownership reason', () => {
      const d = factory.describeForUser(regularUser);
      expect(d.role).toBe(UserRole.USER);
      expect(d.basis).toContain('本人拥有');
      const event = d.resources.find((r) => r.subject === 'Event');
      expect(event?.scope).toBe('own');
      expect(event?.reason).toContain('自己的数据');
      const admin = d.resources.find((r) => r.subject === 'all');
      expect(admin).toBeUndefined(); // 普通用户无权 all
    });
  });

  describe('explain (W5-⑦ 决策解释)', () => {
    it('admin: manage all → allowed', () => {
      const e = factory.explain(adminUser, 'manage', 'all');
      expect(e.allowed).toBe(true);
      expect(e.reason).toContain('管理员');
      expect(e.deniedBy).toBeNull();
    });

    it('user: manage Event → allowed (own scope); manage all → denied', () => {
      const ok = factory.explain(regularUser, 'manage', 'Event');
      expect(ok.allowed).toBe(true);
      expect(ok.reason).toContain('本人所有权');
      const denied = factory.explain(regularUser, 'manage', 'all');
      expect(denied.allowed).toBe(false);
      expect(denied.deniedBy).toBe('casl');
      expect(denied.reason).toContain('管理员');
    });

    // PC-1（CE-2 缺口）：决策 wire 形状在**源侧**冻结——与 specs/protocol/schemas/v1/permission-*.schema.json
    // （additionalProperties:false + 样例）配合：任一侧加/改字段，本断言或 wire-schema 冻结门先红。
    it('PC-1 wire 形状冻结：输出键 == 冻结 schema 契约（describeForUser / explain）', () => {
      const schemaOf = (n: string) =>
        JSON.parse(readFileSync(resolve(__dirname, `../../../specs/protocol/schemas/v1/${n}`), 'utf8')) as {
          properties: Record<string, { items?: { properties: Record<string, unknown> } }>;
        };
      const capSchema = schemaOf('permission-capability-list.schema.json');
      const d = factory.describeForUser(regularUser);
      expect(Object.keys(d).sort()).toEqual(Object.keys(capSchema.properties).sort());
      expect(Object.keys(d.resources[0]).sort()).toEqual(
        Object.keys(capSchema.properties.resources.items!.properties).sort(),
      );

      const decSchema = schemaOf('permission-decision.schema.json');
      const e = factory.explain(regularUser, 'read', 'Event');
      expect(Object.keys(e).sort()).toEqual(Object.keys(decSchema.properties).sort());
    });
  });

  describe('explainForTarget (B1 管理员为目标用户反查决策)', () => {
    it('target regular user: manage Event → allowed; manage all → denied', () => {
      const ok = factory.explainForTarget({ role: regularUser.role, sub: regularUser.sub }, 'manage', 'Event');
      expect(ok.allowed).toBe(true);
      expect(ok.reason).toContain('本人所有权');
      const denied = factory.explainForTarget({ role: regularUser.role, sub: regularUser.sub }, 'manage', 'all');
      expect(denied.allowed).toBe(false);
      expect(denied.deniedBy).toBe('casl');
      expect(denied.reason).toContain('管理员');
    });

    it('target admin: manage all → allowed', () => {
      const e = factory.explainForTarget({ role: adminUser.role, sub: adminUser.sub }, 'manage', 'all');
      expect(e.allowed).toBe(true);
      expect(e.reason).toContain('管理员');
      expect(e.deniedBy).toBeNull();
    });
  });

  /**
   * Audit reader (AW-2). What this block is really pinning is that the role is **read-only and only on
   * the audit surface** — every case below is a denial that has to stay a denial. The `manage all`
   * one matters most: if it ever flips true, the role silently becomes an admin and the separation of
   * duties this role exists for is gone.
   *
   * 审计读者（AW-2）。这一组真正钉的是：该角色**只读，且只在审计面上** —— 下面每一条否定用例都必须
   * 一直是否定。其中 `manage all` 那条最要紧：它一旦翻成 true，这个角色就悄悄变成了管理员，而它存在
   * 的那个理由（审计独立性）随之消失。
   */
  describe('auditor (AW-2 审计读者：只读，且只在审计面上)', () => {
    const auditor = { sub: 5, username: 'aud', role: UserRole.AUDITOR };
    let ability: ReturnType<CaslAbilityFactory['createForUser']>;

    beforeEach(() => {
      ability = factory.createForUser(auditor);
    });

    it('可以读审计行 —— 这正是这个角色存在的理由', () => {
      expect(ability.can('read', 'AuditLog')).toBe(true);
    });

    it('但只能读：读之外的动作一律不许', () => {
      for (const action of ['create', 'update', 'delete', 'manage'] as const) {
        expect(ability.can(action, 'AuditLog')).toBe(false);
      }
    });

    it('绝不带 `manage all` —— 它是审计读者，不是管理员（审计独立性）', () => {
      expect(ability.can('manage', 'all')).toBe(false);
      expect(ability.can('read', 'all')).toBe(false);
    });

    it('也不带普通用户的所有权规则 —— 它是治理记录的读者，不是应用用户', () => {
      expect(ability.can('read', subject('Event', { userId: 5 }))).toBe(false);
      expect(ability.can('manage', subject('User', { id: 5 }))).toBe(false);
    });

    it('管理员不受影响：`manage all` 蕴含任意主体上的 read', () => {
      expect(factory.createForUser(adminUser).can('read', 'AuditLog')).toBe(true);
    });

    it('普通用户仍读不到审计行', () => {
      expect(factory.createForUser(regularUser).can('read', 'AuditLog')).toBe(false);
    });

    /**
     * The regression guard for the field this role needed: `actions` is optional, and omitting it must
     * keep meaning `manage` — the same thing every seed meant before the field existed.
     *
     * 这个角色所需那个字段的回归守卫：`actions` 是可选的，**省略它必须仍然表示 `manage`** ——
     * 与字段出现之前每一条种子的含义相同。
     */
    it('回归：省略 `actions` 的种子仍然授予 `manage`（不写 = 老含义）', () => {
      const userAbility = factory.createForUser(regularUser);
      expect(userAbility.can('manage', subject('Event', { userId: 1 }))).toBe(true);
      expect(userAbility.can('delete', subject('Event', { userId: 1 }))).toBe(true);
    });
  });
});
