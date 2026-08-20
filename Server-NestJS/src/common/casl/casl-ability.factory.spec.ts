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
});
