// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from './feature-flags.service';
import { SettingsService } from '../settings/settings.service';

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

  const mockSettings = (findAll: unknown[] = []) => ({
    set: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue(findAll),
  });

  describe('EASY-5 首启 preset（applyPreset / 运行时覆盖）', () => {
    it('applyPreset small：内存覆盖生效 + 持久化 Settings + 返回应用后 flags', async () => {
      const settings = mockSettings();
      const moduleRef = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          { provide: ConfigService, useValue: mockConfig({}) },
          { provide: SettingsService, useValue: settings },
        ],
      }).compile();
      const svc = moduleRef.get(FeatureFlagsService);
      const flags = await svc.applyPreset('small');
      expect(flags.push).toBe(false);
      expect(flags.sms).toBe(false);
      expect(flags.oauth).toBe(false);
      expect(flags.ai).toBe(true);
      expect(flags.todos).toBe(true);
      // 持久化：关闭清单写入 feature_* + 标记
      expect(settings.set).toHaveBeenCalledWith('feature_push', false, 'boolean');
      expect(settings.set).toHaveBeenCalledWith('feature_flags_selected', 'small', 'string');
      // 运行时覆盖（不依赖 env/preset）
      expect(svc.isEnabled('push')).toBe(false);
      expect(svc.isEnabled('todos')).toBe(true);
    });

    it('applyPreset 非法 preset → BadRequestException', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          { provide: ConfigService, useValue: mockConfig({}) },
          { provide: SettingsService, useValue: mockSettings() },
        ],
      }).compile();
      const svc = moduleRef.get(FeatureFlagsService);
      await expect(svc.applyPreset('bogus')).rejects.toThrow('preset 非法');
    });

    it('loadOverrides 恢复持久化覆盖（重启后首启 preset 仍生效）', async () => {
      const settings = mockSettings([
        { key: 'feature_push', value: 'false', type: 'boolean' },
        { key: 'feature_ai', value: 'true', type: 'boolean' },
        { key: 'feature_flags_selected', value: 'small', type: 'string' },
      ]);
      const moduleRef = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          { provide: ConfigService, useValue: mockConfig({}) },
          { provide: SettingsService, useValue: settings },
        ],
      }).compile();
      await moduleRef.init(); // 触发 onModuleInit → loadOverrides
      const svc = moduleRef.get(FeatureFlagsService);
      expect(svc.isEnabled('push')).toBe(false);
      expect(svc.isEnabled('ai')).toBe(true);
      expect(svc.isEnabled('todos')).toBe(true);
    });

    it('isPresetSelected：Settings 有记录 → true', async () => {
      const settings = mockSettings();
      settings.get.mockResolvedValue('small');
      const moduleRef = await Test.createTestingModule({
        providers: [
          FeatureFlagsService,
          { provide: ConfigService, useValue: mockConfig({}) },
          { provide: SettingsService, useValue: settings },
        ],
      }).compile();
      const svc = moduleRef.get(FeatureFlagsService);
      expect(await svc.isPresetSelected()).toBe(true);
    });
  });
});
