class AppConstants {
  AppConstants._();

  static const String appName = 'KeelBase';
  static const String baseUrl = 'http://localhost:3000/api/v1';
  static const Duration accessTokenExpiry = Duration(minutes: 15);
  static const Duration refreshTokenThreshold = Duration(minutes: 5);

  /// UX-2 环境切换：Dev Menu 修改后需重启应用生效（main() 读取）。
  static String activeBaseUrl = baseUrl;

  /// Dev Menu 可选环境预设（label → baseUrl）。
  static const List<({String label, String url})> devEnvironments = [
    (label: 'Dev', url: 'http://localhost:3000/api/v1'),
    (label: 'Stage', url: 'http://staging.example.com/api/v1'),
    (label: 'Prod', url: 'https://app.example.com/api/v1'),
  ];

  /// 当前 App 版本号（发布时与 pubspec `version:` 同步）
  static const String appVersion = '1.0.0';

  /// 服务端资源基础地址（剥掉 /api/v1 前缀，如 http://localhost:3000）
  static String get resourceBaseUrl {
    if (baseUrl.endsWith('/api/v1')) {
      return baseUrl.substring(0, baseUrl.length - '/api/v1'.length);
    }
    return baseUrl;
  }

  /// 把后端返回的相对路径（如 /uploads/xxx）拼成完整 URL；
  /// 已是绝对 URL（S3 等）则原样返回。
  static String resolveUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$resourceBaseUrl$path';
  }

  // Storage keys
  static const String keyRefreshToken = 'refresh_token';
  static const String keyThemeMode = 'theme_mode';
  static const String keyLanguage = 'language';
  static const String keyDeviceId = 'device_id';
  static const String keyDevBaseUrl = 'dev_base_url';
}
