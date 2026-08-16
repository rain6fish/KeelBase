import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsModule } from './sms.module';
import { SMS_PROVIDER } from './sms.constants';
import { ConsoleSmsProvider } from './console-sms.provider';

describe('SmsModule（工厂分支）', () => {
  const values: Record<string, string> = {};
  const config = { get: jest.fn((key: string, def?: unknown) => values[key] ?? def) };

  afterEach(() => { for (const k of Object.keys(values)) delete values[k]; });

  async function compile() {
    const moduleRef = await Test.createTestingModule({ imports: [SmsModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    return moduleRef.get(SMS_PROVIDER);
  }

  it('SMS_DRIVER=console（默认）→ ConsoleSmsProvider', async () => {
    const provider = await compile();
    expect(provider).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('未知驱动 → null（SmsService 降级日志不阻断）', async () => {
    values['SMS_DRIVER'] = 'aliyun';
    const provider = await compile();
    expect(provider).toBeNull();
  });
});
