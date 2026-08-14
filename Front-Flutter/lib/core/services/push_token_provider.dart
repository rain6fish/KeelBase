import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import 'push_service.dart';

/// 推送 token 上报/注销（GROWTH-1）
///
/// 登录成功后调用 [registerDevice] 上报设备 token 到后端 `/push/tokens`；
/// 登出调用 [unregister] 注销。真实厂商（JPush/FCM）接入后 token 非 null 即生效。
class PushTokenProvider {
  final ApiClient _apiClient;
  final PushService _pushService;
  final String Function() _deviceIdProvider;

  String? _registeredToken;

  PushTokenProvider(
    this._apiClient,
    this._pushService, {
    String Function()? deviceIdProvider,
  }) : _deviceIdProvider = deviceIdProvider ?? _defaultDeviceId;

  static String _defaultDeviceId() {
    // 稳定的匿名设备 ID：基于时间 + 随机（生产建议用 persistent 设备标识）
    final ts = DateTime.now().millisecondsSinceEpoch;
    return 'dev-${ts.toRadixString(16)}-${_randHex(8)}';
  }

  static String _randHex(int n) {
    final r = String.fromCharCodes(
      List.generate(n, (_) => 0x30 + (DateTime.now().millisecondsSinceEpoch % 10)),
    );
    return r;
  }

  /// 初始化推送 SDK（真实厂商）
  Future<void> initialize() => _pushService.initialize();

  /// 登录后注册设备：厂商可用且有 token 才上报
  Future<void> registerDevice() async {
    if (!_pushService.isAvailable) {
      debugPrint('[Push] 未接入厂商（Noop），跳过 token 上报');
      return;
    }
    final token = await _pushService.getToken();
    if (token == null || token.isEmpty) return;
    try {
      await _apiClient.post('/push/tokens', data: {
        'token': token,
        'platform': _platformName(),
        'deviceId': _deviceIdProvider(),
      });
      _registeredToken = token;
      debugPrint('[Push] token 已上报');
    } catch (e) {
      debugPrint('[Push] token 上报失败: $e');
    }
  }

  /// 登出时注销设备 token
  Future<void> unregister() async {
    final token = _registeredToken;
    _registeredToken = null;
    if (token == null || token.isEmpty) return;
    try {
      await _apiClient.delete('/push/tokens/$token');
    } catch (_) {
      // 注销失败不影响登出
    }
  }

  String _platformName() {
    if (!kIsWeb) {
      if (defaultTargetPlatform == TargetPlatform.iOS) return 'ios';
      if (defaultTargetPlatform == TargetPlatform.android) return 'android';
    }
    return 'web';
  }
}
