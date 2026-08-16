import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from './cache.module';
import { CacheService } from './cache.service';

jest.mock('cache-manager-ioredis-yet', () => {
  const MockRedisStore = { create: jest.fn() };
  return { default: MockRedisStore };
});

describe('CacheModule（工厂分支）', () => {
  const values: Record<string, unknown> = {};
  const config = { get: jest.fn((key: string, def?: unknown) => values[key] ?? def) };

  afterEach(() => { for (const k of Object.keys(values)) delete values[k]; });

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
});
