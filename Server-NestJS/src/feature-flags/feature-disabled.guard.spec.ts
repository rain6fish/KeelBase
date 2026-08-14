import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureDisabledGuard } from './feature-disabled.guard';
import { FeatureFlagsService } from './feature-flags.service';

function makeContext(metadata?: unknown) {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    __reflector__: metadata,
  } as any;
}

describe('FeatureDisabledGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  beforeEach(() => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
  });

  it('未标注特性的路由直接放行', () => {
    const flags = { isEnabled: jest.fn() } as unknown as FeatureFlagsService;
    const guard = new FeatureDisabledGuard(reflector, flags);
    const ctx = makeContext();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('特性启用时放行', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue('ai');
    const flags = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as FeatureFlagsService;
    const guard = new FeatureDisabledGuard(reflector, flags);
    const ctx = makeContext();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(flags.isEnabled).toHaveBeenCalledWith('ai');
  });

  it('特性关闭时抛 404（不暴露功能存在性）', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue('ai');
    const flags = { isEnabled: jest.fn().mockReturnValue(false) } as unknown as FeatureFlagsService;
    const guard = new FeatureDisabledGuard(reflector, flags);
    const ctx = makeContext();
    expect(() => guard.canActivate(ctx)).toThrow(NotFoundException);
  });
});
