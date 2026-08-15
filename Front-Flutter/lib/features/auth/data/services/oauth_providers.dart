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

  /// 原生移动平台（iOS/Android）才支持 nativeOnly 提供商（微信/支付宝）。
  static bool get isMobilePlatform {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.android;
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
    final enabledRaw = json['enabledProviders'];
    if (enabledRaw is! List) {
      debugPrint('OAuthProviderConfig: "enabledProviders" missing or malformed — using defaults');
    }
    final enabledIds = enabledRaw is List
        ? enabledRaw.whereType<String>().toList()
        : OAuthProviders.defaultEnabled;

    List<OAuthProviderMeta> parseGroup(String key) {
      final groups = json['groups'];
      if (groups is! Map<String, dynamic>) return [];
      final list = groups[key];
      if (list is! List) return [];
      // 逐条做类型检查，跳过坏条目，避免单个坏数据崩溃整个登录页
      final result = <OAuthProviderMeta>[];
      for (final e in list) {
        if (e is! Map<String, dynamic>) continue;
        final id = e['id'];
        final name = e['name'];
        final icon = e['icon'];
        final group = e['group'];
        if (id is! String || name is! String || icon is! String || group is! String) continue;
        final nativeOnly = e['nativeOnly'];
        result.add(OAuthProviderMeta(
          id: id,
          name: name,
          icon: icon,
          group: group,
          nativeOnly: nativeOnly is bool && nativeOnly,
        ));
      }
      return result.where((meta) => enabledIds.contains(meta.id)).toList();
    }

    return OAuthProviderConfig(
      enabledProviderIds: enabledIds,
      international: parseGroup('international'),
      china: parseGroup('china'),
    );
  }

  /// Fallback when backend is unreachable.
  factory OAuthProviderConfig.defaults() {
    // nativeOnly 提供商（微信/支付宝）仅在原生移动端展示，Web/桌面一律过滤
    return OAuthProviderConfig(
      enabledProviderIds: OAuthProviders.defaultEnabled,
      international: OAuthProviders.all
          .where((p) => p.group == 'international' && OAuthProviders.defaultEnabled.contains(p.id))
          .toList(),
      china: OAuthProviders.all
          .where((p) =>
              p.group == 'china' &&
              OAuthProviders.defaultEnabled.contains(p.id) &&
              (!p.nativeOnly || OAuthProviders.isMobilePlatform))
          .toList(),
    );
  }
}
