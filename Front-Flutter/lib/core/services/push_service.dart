import 'package:flutter/foundation.dart';

/// 推送服务抽象（GROWTH-1 / MS-2.3）
///
/// 平台无关：真实厂商（极光 JPush / Firebase FCM）通过实现本接口接入。
/// 默认 [NoopPushService] 不接厂商，[isAvailable] 恒为 false，
/// 上层（[PushTokenProvider]）据此跳过 token 上报/注销。
///
/// 注意：本接口只负责“获取 token / 展示本地通知”，token 的上报与注销
/// （调用后端 `/push/tokens`）由 `PushTokenProvider` 统一处理。
abstract class PushService {
  /// 初始化 SDK（真实厂商需调用；Noop 无操作）。
  /// 失败语义由实现决定：建议内部捕获并降级，不要抛出未处理异常。
  Future<void> initialize();

  /// 获取设备推送 token（注册号）。
  /// 返回 null 有两种含义：未接入厂商，或获取失败（瞬时 SDK 错误）。
  /// 调用方必须先检查 [isAvailable] 再依赖结果；需要重试时由调用方负责。
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
