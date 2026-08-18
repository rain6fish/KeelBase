import { OAuthProvidersConfigService } from './oauth-providers.config';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/cache/cache.service';

describe('OAuthProvidersConfigService', () => {
  let configService: { get: jest.Mock };
  let cacheService: { get: jest.Mock; set: jest.Mock };
  let service: OAuthProvidersConfigService;

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue('') };
    cacheService = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
    service = new OAuthProvidersConfigService(
      configService as unknown as ConfigService,
      cacheService as unknown as CacheService,
    );
  });

  it('命中缓存直接返回', async () => {
    const cached = { enabledProviders: ['wechat'], providers: [], groups: { international: [], china: [] } };
    cacheService.get.mockResolvedValue(cached);
    await expect(service.getConfig()).resolves.toBe(cached);
    expect(configService.get).not.toHaveBeenCalled();
  });

  it('env 为空时启用默认国内提供商并写入缓存', async () => {
    // 缺省 wechat/alipay，但凭据齐全才可用
    configService.get.mockImplementation((key: string) => {
      if (key === 'WECHAT_APP_ID') return 'wx-id';
      if (key === 'WECHAT_APP_SECRET') return 'wx-secret';
      if (key === 'ALIPAY_APP_ID') return 'ali-id';
      return '';
    });
    const result = await service.getConfig();
    expect(result.enabledProviders).toEqual(['wechat', 'alipay']);
    expect(cacheService.set).toHaveBeenCalledWith('oauth:config', result, 3600 * 1000);
  });

  it('env 指定 google 且有凭据时启用，缺凭据的提供商被过滤', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OAUTH_ENABLED_PROVIDERS') return 'google,wechat,apple';
      if (key === 'GOOGLE_CLIENT_ID') return 'g-client';
      return ''; // wechat 缺 secret、apple 缺 client → 均被过滤
    });
    const result = await service.getConfig();
    expect(result.enabledProviders).toEqual(['google']);
  });

  it('getRedirectUri 有 base 时拼接回调地址，无 base 返回空串', () => {
    configService.get.mockImplementation((key: string) => key === 'OAUTH_REDIRECT_BASE' ? 'https://app.example.com' : '');
    expect(service.getRedirectUri('google')).toBe('https://app.example.com/auth/oauth/google/callback');

    configService.get.mockReturnValue('');
    expect(service.getRedirectUri('wechat')).toBe('');
  });

  it('oidc 配齐凭据时进入 enterprise 组（P2-4）', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OAUTH_ENABLED_PROVIDERS') return 'oidc';
      if (key === 'OIDC_CLIENT_ID') return 'client-id';
      if (key === 'OIDC_CLIENT_SECRET') return 'client-secret';
      if (key === 'OIDC_ISSUER') return 'https://sso.example.com';
      return '';
    });
    const cfg = await service.getConfig();
    expect(cfg.enabledProviders).toContain('oidc');
    expect(cfg.groups.enterprise.map((p) => p.id)).toContain('oidc');
  });

  it('oidc 缺凭据（无 client_secret/issuer）时被过滤', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OAUTH_ENABLED_PROVIDERS') return 'oidc';
      if (key === 'OIDC_CLIENT_ID') return 'client-id';
      return '';
    });
    const cfg = await service.getConfig();
    expect(cfg.enabledProviders).not.toContain('oidc');
    expect(cfg.groups.enterprise).toEqual([]);
  });
});
