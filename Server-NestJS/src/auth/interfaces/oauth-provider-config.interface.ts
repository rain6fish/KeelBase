// SPDX-License-Identifier: Apache-2.0

/**
 * Provider info returned to the frontend for UI rendering.
 */
export interface OAuthProviderInfo {
  /** Provider key, e.g. 'google', 'wechat' */
  id: string;
  /** Display name, e.g. 'Google', '微信' */
  name: string;
  /** Icon identifier (the frontend maps this to a Flutter widget) */
  icon: string;
  /** Region group: 'international' | 'china' | 'enterprise' */
  group: 'international' | 'china' | 'enterprise';
  /** Whether this provider requires a native SDK (vs. web redirect) */
  nativeOnly: boolean;
}

/**
 * Runtime config of all OAuth providers.
 */
export interface OAuthProvidersConfig {
  /** List of provider IDs that are currently enabled */
  enabledProviders: string[];
  /** Full provider metadata (enabled + disabled) */
  providers: OAuthProviderInfo[];
  /** The enabled providers grouped by region */
  groups: {
    international: OAuthProviderInfo[];
    china: OAuthProviderInfo[];
    enterprise: OAuthProviderInfo[];
  };
}
