// SPDX-License-Identifier: Apache-2.0

import { GovernanceCaslAbilityFactory } from './governance-casl.factory';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('GovernanceCaslAbilityFactory（D2-2 简化 CASL：只认 admin）', () => {
  let factory: GovernanceCaslAbilityFactory;

  beforeEach(() => {
    factory = new GovernanceCaslAbilityFactory();
  });

  it('admin → can(manage, all)', () => {
    const ability = factory.createForUser({
      sub: 1,
      username: 'boss',
      role: 'admin',
    } as JwtPayload);
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('read', 'Event')).toBe(true);
    // 规则只有一条：manage all
    expect(ability.rules).toHaveLength(1);
  });

  it('非 admin（user）→ 不授 manage all，任何业务资源都不可管理', () => {
    const ability = factory.createForUser({
      sub: 2,
      username: 'alex',
      role: 'user',
    } as JwtPayload);
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('manage', 'Event')).toBe(false);
    expect(ability.can('read', 'User')).toBe(false);
    expect(ability.rules).toHaveLength(0);
  });
});
