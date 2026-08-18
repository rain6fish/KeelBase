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

  it('任一策略拒绝 → 拒绝', async () => {
    reflector.getAllAndOverride.mockReturnValue([() => true, () => false]);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(false);
  });

  it('策略按顺序逐个执行（every 短路）', async () => {
    const first = jest.fn(() => false);
    const second = jest.fn(() => true);
    reflector.getAllAndOverride.mockReturnValue([first as PolicyHandler, second as PolicyHandler]);
    const request: Record<string, unknown> = { user };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
