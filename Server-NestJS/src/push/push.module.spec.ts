import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PushModule } from './push.module';
import { PUSH_SERVICE } from './push.service';
import { NoopPushService } from './noop-push.service';
import { JPushService } from './jpush.service';
import { PushToken } from './push-token.entity';
import { User } from '../common/entities/user.entity';

describe('PushModule', () => {
  function mockConfig(driver: string, jpushAppKey = 'k', jpushSecret = 's') {
    return {
      get: jest.fn((key: string, def?: any) => {
        const map: Record<string, string> = {
          PUSH_DRIVER: driver,
          JPUSH_APP_KEY: jpushAppKey,
          JPUSH_MASTER_SECRET: jpushSecret,
        };
        return map[key] ?? def;
      }),
    } as unknown as ConfigService;
  }

  async function buildModule(config: ConfigService) {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [PushModule],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(getRepositoryToken(PushToken))
      .useValue({})
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .compile();
    return testingModule;
  }

  it('provides NoopPushService when driver=none', async () => {
    const module = await buildModule(mockConfig('none'));
    expect(module.get(PUSH_SERVICE)).toBeInstanceOf(NoopPushService);
  });

  it('provides JPushService when driver=jpush with credentials', async () => {
    const module = await buildModule(mockConfig('jpush'));
    expect(module.get(PUSH_SERVICE)).toBeInstanceOf(JPushService);
  });

  it('falls back to NoopPushService when jpush lacks credentials', async () => {
    const module = await buildModule(mockConfig('jpush', '', ''));
    expect(module.get(PUSH_SERVICE)).toBeInstanceOf(NoopPushService);
  });
});
