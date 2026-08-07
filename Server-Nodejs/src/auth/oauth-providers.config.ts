import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/cache/cache.service';
import type { OAuthProviderInfo, OAuthProvidersConfig } from './interfaces/oauth-provider-config.interface';

/**
 * All known providers (enabled or not).
 */
const ALL_PROVIDERS: OAuthProviderInfo[] = [
  // ── International ──
  { id: 'google',     name: 'Google',      icon: 'google',        group: 'international', nativeOnly: false },
  { id: 'apple',      name: 'Apple',       icon: 'apple',         group: 'international', nativeOnly: false },

  // ── China ──
  { id: 'wechat',     name: '微信',         icon: 'wechat',        group: 'china',         nativeOnly: true  },
  { id: 'alipay',     name: '支付宝',       icon: 'alipay',        group: 'china',         nativeOnly: true  },
];

/**
 * Default enabled set when env var is empty.
 */
const DEFAULT_ENABLED = ['wechat', 'alipay'];

/**
 * OAuth provider registry — reads env config to determine which providers
 * are enabled, and provides metadata to the frontend.
 */
@Injectable()
export class OAuthProvidersConfigService {
  constructor(
    private configService: ConfigService,
    private cacheService: CacheService,
  ) {}

  /**
   * Get the current runtime config.
   */
  async getConfig(): Promise<OAuthProvidersConfig> {
    const cached = await this.cacheService.get<OAuthProvidersConfig>('oauth:config');
    if (cached) return cached;

    const raw = this.configService.get<string>('OAUTH_ENABLED_PROVIDERS', '');
    const enabledIds = raw
      ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : DEFAULT_ENABLED;

    // Filter out providers whose credentials are missing
    const available = ALL_PROVIDERS.filter((p) => {
      if (!enabledIds.includes(p.id)) return false;
      return this.hasCredentials(p.id);
    });

    const result: OAuthProvidersConfig = {
      enabledProviders: available.map((p) => p.id),
      providers: ALL_PROVIDERS,
      groups: {
        international: available.filter((p) => p.group === 'international'),
        china: available.filter((p) => p.group === 'china'),
      },
    };
    await this.cacheService.set('oauth:config', result, 3600 * 1000);
    return result;
  }

  /**
   * Check if the required credentials exist for a provider.
   */
  private hasCredentials(providerId: string): boolean {
    switch (providerId) {
      case 'google':
        return !!this.configService.get<string>('GOOGLE_CLIENT_ID', '');
      case 'apple':
        return !!this.configService.get<string>('APPLE_CLIENT_ID', '');
      case 'wechat':
        return !!this.configService.get<string>('WECHAT_APP_ID', '') &&
               !!this.configService.get<string>('WECHAT_APP_SECRET', '');
      case 'alipay':
        return !!this.configService.get<string>('ALIPAY_APP_ID', '');
      default:
        return false;
    }
  }

  /**
   * Get the available redirect URI for a provider (used in native OAuth flows).
   */
  getRedirectUri(providerId: string): string {
    const base = this.configService.get<string>('OAUTH_REDIRECT_BASE', '');
    if (base) return `${base}/auth/oauth/${providerId}/callback`;
    return '';
  }
}
