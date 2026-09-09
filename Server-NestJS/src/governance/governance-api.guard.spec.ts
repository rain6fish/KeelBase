// SPDX-License-Identifier: Apache-2.0

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GovernanceApiGuard } from './governance-api.guard';

function mockContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('GovernanceApiGuard（D2-3 服务身份 x-api-key / Bearer 认证）', () => {
  let guard: GovernanceApiGuard;
  const originalKey = process.env.GOVERNANCE_API_KEY;

  beforeAll(() => {
    process.env.GOVERNANCE_API_KEY = 'gov-service-secret';
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.GOVERNANCE_API_KEY;
    else process.env.GOVERNANCE_API_KEY = originalKey;
  });

  beforeEach(() => {
    guard = new GovernanceApiGuard();
  });

  it('x-api-key 匹配 → 放行', () => {
    expect(guard.canActivate(mockContext({ 'x-api-key': 'gov-service-secret' }))).toBe(true);
  });

  it('x-api-key 不匹配 → 抛 UnauthorizedException', () => {
    expect(() => guard.canActivate(mockContext({ 'x-api-key': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('Authorization Bearer 匹配 → 放行（大小写不敏感 scheme）', () => {
    expect(
      guard.canActivate(mockContext({ authorization: 'bearer gov-service-secret' })),
    ).toBe(true);
  });

  it('Authorization Bearer 不匹配 → 抛 UnauthorizedException', () => {
    expect(() =>
      guard.canActivate(mockContext({ authorization: 'Bearer wrong-token' })),
    ).toThrow(UnauthorizedException);
  });

  it('x-api-key 优先于 Authorization（header 正确、bearer 错误）→ 放行', () => {
    expect(
      guard.canActivate(
        mockContext({
          'x-api-key': 'gov-service-secret',
          authorization: 'Bearer wrong-token',
        }),
      ),
    ).toBe(true);
  });

  it('authorization 非字符串（数组）→ 视作无 bearer，抛 UnauthorizedException', () => {
    expect(() =>
      guard.canActivate(mockContext({ authorization: ['Bearer', 'x'] })),
    ).toThrow(UnauthorizedException);
  });

  it('未提供任何凭据 → 抛 UnauthorizedException', () => {
    expect(() => guard.canActivate(mockContext({}))).toThrow(UnauthorizedException);
  });

  it('服务端未配置 GOVERNANCE_API_KEY → 即使凭据匹配也拒绝', () => {
    const prev = process.env.GOVERNANCE_API_KEY;
    delete process.env.GOVERNANCE_API_KEY;
    try {
      expect(() =>
        guard.canActivate(mockContext({ 'x-api-key': 'gov-service-secret' })),
      ).toThrow(UnauthorizedException);
    } finally {
      process.env.GOVERNANCE_API_KEY = prev;
    }
  });
});
