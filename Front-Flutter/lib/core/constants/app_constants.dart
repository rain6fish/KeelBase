// SPDX-License-Identifier: Apache-2.0

class AppConstants {
  AppConstants._();

  static const String appName = 'KeelBase';
  /// API 基址：默认本地开发；构建期用 `--dart-define=API_BASE_URL=...` 覆盖。
  /// 生产同域反代传相对路径 `/api/v1`，跨域传完整地址（如 `https://api.example.com/api/v1`）。
  /// （CR-7：避免硬编码 localhost 导致生产不可用 + HTTPS 混合内容拦截）
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
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
  static const String appVersion = '0.9.2';

  /// 服务端资源基础地址（剥掉 /api/v1 前缀，如 http://localhost:3000）。
  /// 跟随 [activeBaseUrl]，确保 Dev Menu 切换环境后资源 URL 同步指向新 host。
  static String get resourceBaseUrl {
    final url = activeBaseUrl;
    if (url.endsWith('/api/v1')) {
      return url.substring(0, url.length - '/api/v1'.length);
    }
    return url;
  }

  /// 把后端返回的相对路径（如 /uploads/xxx）拼成完整 URL；
  /// 已是绝对 URL（S3 等）则原样返回；协议相对路径（//host/x）按协议相对处理。
  static String resolveUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('//')) return path; // 协议相对 URL，交由上层显式解析
    return '$resourceBaseUrl${path.startsWith('/') ? '' : '/'}$path';
  }

  // Storage keys
  static const String keyRefreshToken = 'refresh_token';
  static const String keyThemeMode = 'theme_mode';
  static const String keyLanguage = 'language';
  static const String keyDeviceId = 'device_id';
  static const String keyDevBaseUrl = 'dev_base_url';
}
