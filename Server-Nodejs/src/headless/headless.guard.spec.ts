import { UnauthorizedException } from '@nestjs/common';
import { HeadlessGuard } from './headless.guard';

function makeContext(key?: string) {
  const req = { headers: key ? { 'x-api-key': key } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function makeGuard(opts: {
  envKey?: string;
  storedKeys?: boolean;
  authenticate?: jest.Mock;
}) {
  const keysService = {
    hasStoredKeys: jest.fn().mockResolvedValue(opts.storedKeys ?? true),
    authenticate: opts.authenticate ?? jest.fn().mockResolvedValue({ id: 1, ownerUserId: 2 }),
  };
  const configService = { get: () => opts.envKey ?? '' };
  return { guard: new HeadlessGuard(configService as any, keysService as any), keysService };
}

describe('HeadlessGuard（AI-19/HS-4）', () => {
  it('缺 key 时拒绝', () => {
    const { guard } = makeGuard({ envKey: 'secret' });
    expect(() => guard.canActivate(makeContext(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('env 未配置且无入库 key 时拒绝', async () => {
    const { guard } = makeGuard({ envKey: '', storedKeys: false });
    await expect(guard.canActivate(makeContext('k'))).rejects.toThrow(UnauthorizedException);
  });

  it('x-api-key 匹配入库 key 时放行并挂上下文', async () => {
    const ctx = { id: 7, name: 'my-key', ownerUserId: 9, toolWhitelist: null, quotaPerDay: 100 };
    const authenticate = jest.fn().mockResolvedValue(ctx);
    const { guard, keysService } = makeGuard({ envKey: '', storedKeys: true, authenticate });
    const req = { headers: { 'x-api-key': 'k-123' } };
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any);
    expect(authenticate).toHaveBeenCalledWith('k-123', '');
    expect((req as any).headlessKey).toBe(ctx);
  });

  it('无效 key 时拒绝', async () => {
    const authenticate = jest.fn().mockRejectedValue(new UnauthorizedException('无效的 API Key'));
    const { guard } = makeGuard({ envKey: '', storedKeys: true, authenticate });
    await expect(guard.canActivate(makeContext('bad'))).rejects.toThrow(UnauthorizedException);
  });
});
