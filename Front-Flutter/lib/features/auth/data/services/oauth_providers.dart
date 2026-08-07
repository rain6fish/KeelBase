import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';

/// Metadata for a single OAuth provider.
class OAuthProviderMeta {
  final String id;
  final String name;
  final String icon;
  final String group; // 'international' | 'china'
  final bool nativeOnly;

  const OAuthProviderMeta({
    required this.id,
    required this.name,
    required this.icon,
    required this.group,
    required this.nativeOnly,
  });
}

/// Static OAuth provider definitions.
///
/// The frontend fetches the *enabled* provider list from the backend
/// via `GET /api/v1/auth/oauth/providers`. This file provides the
/// full registry metadata and icons for rendering.
class OAuthProviders {
  /// Full provider metadata registry.
  static const all = <OAuthProviderMeta>[
    // International
    OAuthProviderMeta(id: 'google', name: 'Google', icon: 'google', group: 'international', nativeOnly: false),
    OAuthProviderMeta(id: 'apple',  name: 'Apple',  icon: 'apple',  group: 'international', nativeOnly: false),
    // China
    OAuthProviderMeta(id: 'wechat', name: '微信',    icon: 'wechat', group: 'china', nativeOnly: true),
    OAuthProviderMeta(id: 'alipay', name: '支付宝',  icon: 'alipay', group: 'china', nativeOnly: true),
  ];

  static final _registry = <String, OAuthProviderMeta>{
    for (final p in all) p.id: p,
  };

  /// Look up a provider by its ID.
  static OAuthProviderMeta? get(String id) => _registry[id];

  /// Get the CupertinoIcons icon widget for the given provider.
  static IconData iconFor(String providerId) {
    switch (providerId) {
      case 'google':
        return CupertinoIcons.search;
      case 'apple':
        return CupertinoIcons.chevron_right_circle_fill;
      case 'wechat':
        return CupertinoIcons.chat_bubble_2_fill;
      case 'alipay':
        return CupertinoIcons.creditcard_fill;
      default:
        return CupertinoIcons.square_arrow_up_fill;
    }
  }

  /// Default enabled providers when the backend config is unavailable.
  static const defaultEnabled = ['wechat', 'alipay'];
}

/// Provider configuration fetched from the backend.
class OAuthProviderConfig {
  final List<String> enabledProviderIds;
  final List<OAuthProviderMeta> international;
  final List<OAuthProviderMeta> china;

  OAuthProviderConfig({
    required this.enabledProviderIds,
    List<OAuthProviderMeta>? international,
    List<OAuthProviderMeta>? china,
  })  : international = international ?? [],
        china = china ?? [];

  bool get hasInternational => international.isNotEmpty;
  bool get hasChina => china.isNotEmpty;
  bool get isEmpty => international.isEmpty && china.isEmpty;

  /// Parse from backend JSON response.
  factory OAuthProviderConfig.fromJson(Map<String, dynamic> json) {
    final enabledIds = (json['enabledProviders'] as List<dynamic>?)
            ?.cast<String>() ??
        OAuthProviders.defaultEnabled;

    List<OAuthProviderMeta> parseGroup(String key) {
      final list = (json['groups'] as Map<String, dynamic>?)?[key] as List<dynamic>?;
      if (list == null) return [];
      return list
          .where((e) => enabledIds.contains(e['id'] as String))
          .map((e) => OAuthProviderMeta(
                id: e['id'] as String,
                name: e['name'] as String,
                icon: e['icon'] as String,
                group: e['group'] as String,
                nativeOnly: e['nativeOnly'] as bool,
              ))
          .toList();
    }

    return OAuthProviderConfig(
      enabledProviderIds: enabledIds,
      international: parseGroup('international'),
      china: parseGroup('china'),
    );
  }

  /// Fallback when backend is unreachable.
  factory OAuthProviderConfig.defaults() {
    return OAuthProviderConfig(
      enabledProviderIds: OAuthProviders.defaultEnabled,
      international: OAuthProviders.all
          .where((p) => p.group == 'international' && OAuthProviders.defaultEnabled.contains(p.id))
          .toList(),
      china: OAuthProviders.all
          .where((p) => p.group == 'china' && OAuthProviders.defaultEnabled.contains(p.id))
          .toList(),
    );
  }
}
