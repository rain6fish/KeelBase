import 'package:flutter/foundation.dart';

/// 推送服务抽象（GROWTH-1 / MS-2.3）
///
/// 平台无关：真实厂商（极光 JPush / Firebase FCM）通过实现本接口接入。
/// 默认 [NoopPushService] 不接厂商，token 为 null（不注册），但上报/注销逻辑完整。
abstract class PushService {
  /// 初始化 SDK（真实厂商需调用；Noop 无操作）
  Future<void> initialize();

  /// 获取设备推送 token（注册号）；无厂商/失败返回 null
  Future<String?> getToken();

  /// 前台收到推送时本地展示通知（真实厂商需实现；Noop 无操作）
  Future<void> showNotification({required String title, required String body});

  /// 当前是否为真实可用实现（false = Noop，不上报 token）
  bool get isAvailable;
}

/// 默认实现：不接厂商，token 为 null。真实接入时替换为 JPush/FCM 实现。
class NoopPushService implements PushService {
  @override
  Future<void> initialize() async {}

  @override
  Future<String?> getToken() async => null;

  @override
  Future<void> showNotification({required String title, required String body}) async {
    debugPrint('[Push] (noop) notification: $title - $body');
  }

  @override
  bool get isAvailable => false;
}
