// SPDX-License-Identifier: Apache-2.0

import { subject } from '@casl/ability';
import { CaslAbilityFactory } from './casl-ability.factory';
import { UserRole } from '../entities/user.entity';

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
});
