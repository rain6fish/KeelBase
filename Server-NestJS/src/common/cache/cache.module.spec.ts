// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule, buildCacheOptions } from './cache.module';
import { CacheService } from './cache.service';

// 真实导出是**具名** `redisStore`（旧 spec 误 mock 了不存在的 `default`，等于没测到东西）。
// 当前实现**不调用**它（适配器与 cache-manager v7 不兼容，见 cache.module.ts 注释）——mock 保留仅为断言之用。
jest.mock('cache-manager-ioredis-yet', () => ({ redisStore: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { redisStore } = require('cache-manager-ioredis-yet') as { redisStore: jest.Mock };

describe('CacheModule（工厂分支）', () => {
  const values: Record<string, unknown> = {};
  const config = {
    get: jest.fn((key: string, def?: unknown) => values[key] ?? def),
  } as unknown as ConfigService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    redisStore.mockReset();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
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

  describe('buildCacheOptions（store 形状与「配了 Redis 不生效」告警）', () => {
    it('未配 REDIS_URL：内存 store 是预期行为，不告警', async () => {
      const opts = await buildCacheOptions(config);
      expect(opts.ttl).toBe(300);
      expect(opts).not.toHaveProperty('stores');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('配了 REDIS_URL：**显式告警**且仍为内存 store（不再静默降级）', async () => {
      values['REDIS_URL'] = 'redis://cache:6379';
      const opts = await buildCacheOptions(config);
      expect(opts).not.toHaveProperty('stores');
      expect(opts.ttl).toBe(300);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0][0]);
      expect(msg).toContain('redis://cache:6379');
      expect(msg).toContain('不生效');
      expect(msg).toContain('@keyv/redis'); // 告警给出正确修法指向
    });

    it('CACHE_ENABLED=false：不告警（本就不读写）', async () => {
      values['CACHE_ENABLED'] = false;
      values['REDIS_URL'] = 'redis://cache:6379';
      await buildCacheOptions(config);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
