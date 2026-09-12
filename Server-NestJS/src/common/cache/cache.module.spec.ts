// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule, buildCacheOptions } from './cache.module';
import { CacheService } from './cache.service';

jest.mock('@keyv/redis', () => ({ createKeyv: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createKeyv } = require('@keyv/redis') as { createKeyv: jest.Mock };

describe('CacheModule（工厂分支）', () => {
  const values: Record<string, unknown> = {};
  const config = {
    get: jest.fn((key: string, def?: unknown) => values[key] ?? def),
  } as unknown as ConfigService;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    createKeyv.mockReset();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    for (const k of Object.keys(values)) delete values[k];
  });

  async function compile() {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), CacheModule],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    return moduleRef.get(CacheService);
  }

  it('CACHE_ENABLED=true（默认）时 CacheService.enabled=true', async () => {
    const svc = await compile();
    expect(svc.enabled).toBe(true);
  });

  it('CACHE_ENABLED=false 时 CacheService.enabled=false（降级不读写）', async () => {
    values['CACHE_ENABLED'] = false;
    const svc = await compile();
    expect(svc.enabled).toBe(false);
  });

  describe('buildCacheOptions（store 形状）', () => {
    it('未配 REDIS_URL：内存 store 是预期行为，不告警、不建 Keyv', async () => {
      const opts = await buildCacheOptions(config);
      expect(opts.ttl).toBe(300);
      expect(opts).not.toHaveProperty('stores');
      expect(createKeyv).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('配了 REDIS_URL：用 @keyv/redis 的 createKeyv(url) 放进 stores（v7 只认 stores）', async () => {
      values['REDIS_URL'] = 'redis://cache:6379';
      const kv = { name: 'keyv-instance' };
      createKeyv.mockReturnValue(kv);
      const opts = await buildCacheOptions(config);

      expect(createKeyv).toHaveBeenCalledWith('redis://cache:6379');
      expect(opts.stores).toEqual([kv]);
      expect(opts.ttl).toBe(300);
      // 回归守卫：旧写法这两个键会被 cache-manager v7 忽略 → 静默走内存（配了 Redis 实际没用上）
      expect(opts).not.toHaveProperty('store');
      expect(opts).not.toHaveProperty('url');
      expect(warnSpy).not.toHaveBeenCalled();
      expect(String(logSpy.mock.calls[0]?.[0])).toContain('Redis store');
    });

    it('CACHE_ENABLED=false：不建 Redis store（enabled=false 本就不读写）', async () => {
      values['CACHE_ENABLED'] = false;
      values['REDIS_URL'] = 'redis://cache:6379';
      const opts = await buildCacheOptions(config);
      expect(createKeyv).not.toHaveBeenCalled();
      expect(opts).not.toHaveProperty('stores');
    });

    it('createKeyv 抛错（URL 非法等）：告警降级内存，不抛', async () => {
      values['REDIS_URL'] = 'not-a-url';
      createKeyv.mockImplementation(() => {
        throw new Error('bad url');
      });
      const opts = await buildCacheOptions(config);
      expect(opts).not.toHaveProperty('stores');
      expect(opts.ttl).toBe(300);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('降级');
    });
  });
});
