// SPDX-License-Identifier: Apache-2.0

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './policies.guard';
import { CaslAbilityFactory } from './casl-ability.factory';
import { UserRole } from '../entities/user.entity';
import { PolicyHandler } from './check-policies.decorator';

describe('PoliciesGuard', () => {
  let guard: PoliciesGuard;
  let reflector: jest.Mocked<Reflector>;
  let abilityFactory: jest.Mocked<CaslAbilityFactory>;

  const user = { sub: 1, username: 'alice', role: UserRole.USER };

  const makeContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => (() => {}),
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    abilityFactory = {
      createForUser: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<CaslAbilityFactory>;
    guard = new PoliciesGuard(reflector, abilityFactory);
  });

  it('@Public() 路由无 user → 直接放行，不构建能力', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(abilityFactory.createForUser).not.toHaveBeenCalled();
  });

  it('有 user 但无策略 → 放行并挂载 ability', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(abilityFactory.createForUser).toHaveBeenCalledWith(user);
    expect(request.ability).toBeDefined();
  });

  it('全部策略通过 → 放行', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => true, () => true]);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('任一策略拒绝 → 抛 403 且附 explanation（W5-⑦ 为何阻止）', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => true, () => false]);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow('Forbidden resource');
  });

  it('403 explanation 带「为什么 + 怎么解决」：共享形状 + zh 文案 + 机器可读 key', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => false]);
    const request: Record<string, unknown> = {
      user,
      headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
    };

    const err = await guard.canActivate(makeContext(request)).catch((e: unknown) => e);
    const explanation = (err as { getResponse: () => { explanation: Record<string, unknown> } })
      .getResponse().explanation;

    expect(explanation).toMatchObject({
      deniedBy: 'casl',
      reasonKey: 'ai.deny.casl_user.reason',
      nextStepKey: 'ai.deny.casl_user.nextStep',
      params: { role: 'user' },
    });
    expect(explanation.reason).toContain('管理员');
    expect(explanation.nextStep).toContain('管理员');
  });

  it('403 explanation 跟随 Accept-Language：en 请求得到英文文案（同一 key）', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => false]);
    const request: Record<string, unknown> = {
      user,
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    };

    const err = await guard.canActivate(makeContext(request)).catch((e: unknown) => e);
    const explanation = (err as { getResponse: () => { explanation: Record<string, unknown> } })
      .getResponse().explanation;

    expect(explanation.reasonKey).toBe('ai.deny.casl_user.reason');
    expect(explanation.reason).toContain('Administrator privileges');
    expect(explanation.nextStep).toContain('administrator');
  });

  it('admin 被策略拒 → casl_admin 类别（文案与普通用户不同）', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => false]);
    const request: Record<string, unknown> = {
      user: { ...user, role: UserRole.ADMIN },
      headers: { 'accept-language': 'en' },
    };

    const err = await guard.canActivate(makeContext(request)).catch((e: unknown) => e);
    const explanation = (err as { getResponse: () => { explanation: Record<string, unknown> } })
      .getResponse().explanation;

    expect(explanation.reasonKey).toBe('ai.deny.casl_admin.reason');
  });

  it('策略按顺序逐个执行（every 短路）', async () => {
    const first = jest.fn(() => false);
    const second = jest.fn(() => true);
    reflector.getAllAndOverride.mockReturnValue([first as PolicyHandler, second as PolicyHandler]);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow('Forbidden resource');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
