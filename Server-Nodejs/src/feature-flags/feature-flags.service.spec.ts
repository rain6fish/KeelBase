import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  const mockConfig = (values: Record<string, unknown>) => ({
    get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)),
  });

  it('缺省全部启用', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({}) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(svc.isEnabled('ai')).toBe(true);
    expect(svc.isEnabled('search')).toBe(true);
    expect(svc.isEnabled('push')).toBe(true);
  });

  it('显式 false 关闭对应特性，其余不受影响', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({ FEATURE_AI_ENABLED: false }) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(svc.isEnabled('ai')).toBe(false);
    expect(svc.isEnabled('search')).toBe(true);
  });

  it('字符串 "false" 被 Joi 布尔化后按 false 处理', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({ FEATURE_AI_ENABLED: false }) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    const flags = svc.getFlags();
    expect(flags.ai).toBe(false);
    expect(flags.todos).toBe(true);
  });

  it('getFlags 返回全部 key', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({}) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(Object.keys(svc.getFlags()).sort()).toEqual(
      ['ai', 'notifications', 'oauth', 'push', 'search', 'sms', 'todos', 'upload'],
    );
  });
});
