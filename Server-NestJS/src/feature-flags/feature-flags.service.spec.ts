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
      ['ai', 'approval', 'books', 'contracts', 'crm', 'notes', 'notifications', 'oauth', 'org', 'pm', 'points', 'posts', 'push', 'search', 'sms', 'suppliers', 'tags', 'todos', 'upload'],
    );
  });

  it('EASY-3: small 预设默认关闭外部集成，full 全开', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({ APP_PRESET: 'small' }) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(svc.getPreset()).toBe('small');
    expect(svc.isEnabled('push')).toBe(false);
    expect(svc.isEnabled('sms')).toBe(false);
    expect(svc.isEnabled('oauth')).toBe(false);
    expect(svc.isEnabled('ai')).toBe(true);
    expect(svc.isEnabled('todos')).toBe(true);
  });

  it('EASY-3: lite 预设再关搜索与生成模块', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({ APP_PRESET: 'lite' }) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(svc.isEnabled('search')).toBe(false);
    expect(svc.isEnabled('tags')).toBe(false);
    expect(svc.isEnabled('push')).toBe(false);
    expect(svc.isEnabled('todos')).toBe(true);
  });

  it('EASY-3: 显式 env 优先于预设', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: mockConfig({ APP_PRESET: 'small', FEATURE_PUSH_ENABLED: true }) },
      ],
    }).compile();
    const svc = moduleRef.get(FeatureFlagsService);
    expect(svc.isEnabled('push')).toBe(true);
    expect(svc.isEnabled('sms')).toBe(false);
  });
});
