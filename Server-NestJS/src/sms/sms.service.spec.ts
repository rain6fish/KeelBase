import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService, SmsProvider } from './sms.service';
import { SMS_PROVIDER } from './sms.constants';

describe('SmsService', () => {
  let service: SmsService;
  let provider: SmsProvider;

  const mockProvider = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'SMS_DRIVER') return 'console';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: SMS_PROVIDER, useValue: mockProvider },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
    provider = module.get<SmsProvider>(SMS_PROVIDER);
    jest.clearAllMocks();
  });

  it('sends verification code through provider', async () => {
    await service.sendVerificationCode('+8613800138000', '123456');
    expect(provider.send).toHaveBeenCalledWith('+8613800138000', expect.stringContaining('123456'));
  });

  it('skips send without crashing when provider is null', async () => {
    const nullService = new SmsService(null, mockConfig as any);
    await expect(nullService.sendVerificationCode('+8613800138000', '123456')).resolves.toBeUndefined();
  });

  it('reports driver name from config', () => {
    expect(service.driver).toBe('console');
    expect(service.enabled).toBe(true);
  });
});
