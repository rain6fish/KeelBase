/// MOD-4 capabilities 端点返回：当前预设 + 功能开关 + 启用业务模块。
/// 三端按此隐藏未启用模块的导航入口（EASY-5 预设引导同用）。
class AppCapabilities {
  final String preset;
  final Map<String, bool> features;
  final AiStatus? ai;
  final List<BusinessModule> businessModules;

  const AppCapabilities({
    required this.preset,
    this.features = const {},
    this.ai,
    this.businessModules = const [],
  });

  /// 功能开关默认视为开启（未知 key 不误隐藏导航）。
  bool isFeatureEnabled(String key) => features[key] ?? true;

  bool hasBusinessModule(String id) =>
      businessModules.any((m) => m.id == id);

  factory AppCapabilities.fromJson(Map<String, dynamic> json) {
    return AppCapabilities(
      preset: json['preset'] as String? ?? 'full',
      features: Map<String, bool>.from(json['features'] as Map? ?? {}),
      ai: json['ai'] == null
          ? null
          : AiStatus.fromJson(json['ai'] as Map<String, dynamic>),
      businessModules: (json['businessModules'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(BusinessModule.fromJson)
          .toList(),
    );
  }
}

/// 运行时 AI 可用性：enabled = feature flag；providerConfigured = LLM 真的配了 Key/本地模型
class AiStatus {
  final bool enabled;
  final bool providerConfigured;
  final String provider;

  const AiStatus({
    required this.enabled,
    required this.providerConfigured,
    this.provider = '',
  });

  factory AiStatus.fromJson(Map<String, dynamic> json) {
    return AiStatus(
      enabled: json['enabled'] as bool? ?? true,
      providerConfigured: json['providerConfigured'] as bool? ?? false,
      provider: json['provider'] as String? ?? '',
    );
  }
}

class BusinessModule {
  final String id;
  final String label;

  const BusinessModule({required this.id, this.label = ''});

  factory BusinessModule.fromJson(Map<String, dynamic> json) {
    return BusinessModule(
      id: json['id'] as String? ?? '',
      label: json['label'] as String? ?? '',
    );
  }
}
