import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import 'push_service.dart';

/// 推送 token 上报/注销（GROWTH-1）
///
/// 登录成功后调用 [registerDevice] 上报设备 token 到后端 `/push/tokens`；
/// 登出调用 [unregister] 注销。真实厂商（JPush/FCM）接入后 token 非 null 即生效。
///
/// register/unregister 通过内部队列**串行执行**：即使登出发生在注册进行中，
/// 注册完成后再执行注销，避免「登出后设备仍保持注册」的残留。
class PushTokenProvider {
  static const _keyPushDeviceId = 'push_device_id';

  final ApiClient _apiClient;
  final PushService _pushService;
  final String Function()? _customDeviceIdProvider;

  String? _registeredToken;
  String? _deviceId; // 稳定的设备 ID（仅默认生成路径使用）
  Future<void> _queue = Future.value();

  PushTokenProvider(
    this._apiClient,
    this._pushService, {
    String Function()? deviceIdProvider,
  }) : _customDeviceIdProvider = deviceIdProvider;

  /// 稳定的匿名设备 ID：跨启动持久化到 SharedPreferences（web 上同样稳定）；
  /// 未注入自定义 provider 时用 Random.secure() 生成一次并复用，
  /// 避免每次 registerDevice 都向后端上报新设备 ID（重复设备记录）。
  Future<String> _getDeviceId() async {
    final custom = _customDeviceIdProvider;
    if (custom != null) return custom();
    final memo = _deviceId;
    if (memo != null) return memo;
    try {
      final prefs = await SharedPreferences.getInstance();
      final existing = prefs.getString(_keyPushDeviceId);
      if (existing != null && existing.isNotEmpty) {
        _deviceId = existing;
        return existing;
      }
      final id = _generateDeviceId();
      await prefs.setString(_keyPushDeviceId, id);
      _deviceId = id;
      return id;
    } catch (_) {
      // 存储不可用：退化为会话内稳定 ID
      final id = _generateDeviceId();
      _deviceId = id;
      return id;
    }
  }

  static String _generateDeviceId() {
    final random = Random.secure();
    final bytes = List<int>.generate(8, (_) => random.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return 'dev-$hex';
  }

  /// 初始化推送 SDK（真实厂商）
  Future<void> initialize() => _pushService.initialize();

  /// 登录后注册设备：厂商可用且有 token 才上报。
  /// 与 [unregister] 串行执行，防止登出与进行中的注册交错。
  Future<void> registerDevice() {
    return _serialize(() async {
      if (!_pushService.isAvailable) {
        debugPrint('[Push] 未接入厂商（Noop），跳过 token 上报');
        return;
      }
      final token = await _pushService.getToken();
      if (token == null || token.isEmpty) return;
      final deviceId = await _getDeviceId();
      try {
        // 换新 vendor token 时先注销旧记录，避免陈旧 token 一直生效
        final previous = _registeredToken;
        if (previous != null && previous != token) {
          try {
            await _apiClient.delete(
              '/push/tokens/${Uri.encodeComponent(previous)}',
            );
          } catch (_) {
            // 旧 token 注销失败不影响新 token 上报
          }
        }
        await _apiClient.post('/push/tokens', data: {
          'token': token,
          'platform': _platformName(),
          'deviceId': deviceId,
        });
        _registeredToken = token;
        debugPrint('[Push] token 已上报');
      } catch (e) {
        debugPrint('[Push] token 上报失败: $e');
      }
    });
  }

  /// 登出时注销设备 token。与 [registerDevice] 串行执行。
  Future<void> unregister() {
    return _serialize(() async {
      final token = _registeredToken;
      _registeredToken = null;
      if (token == null || token.isEmpty) return;
      try {
        await _apiClient.delete('/push/tokens/${Uri.encodeComponent(token)}');
      } catch (_) {
        // 注销失败不影响登出
      }
    });
  }

  /// 串行队列：排队执行 [action]，保证 register/unregister 不交错。
  Future<void> _serialize(Future<void> Function() action) {
    final next = _queue.then((_) => action());
    _queue = next.catchError((Object _) {});
    return next;
  }

  String _platformName() {
    if (!kIsWeb) {
      if (defaultTargetPlatform == TargetPlatform.iOS) return 'ios';
      if (defaultTargetPlatform == TargetPlatform.android) return 'android';
    }
    return 'web';
  }
}
