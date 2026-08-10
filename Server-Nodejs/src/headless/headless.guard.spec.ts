import { UnauthorizedException } from '@nestjs/common';
import { HeadlessGuard } from './headless.guard';

function makeContext(key?: string) {
  const req = { headers: key ? { 'x-api-key': key } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('HeadlessGuard（AI-19）', () => {
  it('未配置 HEADLESS_API_KEY 时拒绝', () => {
    const guard = new HeadlessGuard({ get: () => '' } as any);
    expect(() => guard.canActivate(makeContext('k'))).toThrow(UnauthorizedException);
  });

  it('x-api-key 匹配时放行', () => {
    const guard = new HeadlessGuard({ get: () => 'secret' } as any);
    expect(guard.canActivate(makeContext('secret'))).toBe(true);
  });

  it('x-api-key 不匹配时拒绝', () => {
    const guard = new HeadlessGuard({ get: () => 'secret' } as any);
    expect(() => guard.canActivate(makeContext('wrong'))).toThrow(UnauthorizedException);
  });

  it('缺 key 时拒绝', () => {
    const guard = new HeadlessGuard({ get: () => 'secret' } as any);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });
});
