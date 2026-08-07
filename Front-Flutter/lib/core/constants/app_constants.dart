class AppConstants {
  AppConstants._();

  static const String appName = 'ShiYu-AppBase';
  static const String baseUrl = 'http://localhost:3000/api/v1';
  static const Duration accessTokenExpiry = Duration(minutes: 15);
  static const Duration refreshTokenThreshold = Duration(minutes: 5);

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
}
