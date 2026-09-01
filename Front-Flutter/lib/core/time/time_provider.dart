// SPDX-License-Identifier: Apache-2.0

/// Abstract time provider for testability.
///
/// `now()` 统一返回 **UTC** 时间，避免时区/DST 导致的时间不一致；
/// 需要展示本地时间时由调用方自行 `.toLocal()` 转换。
abstract class TimeProvider {
  DateTime now();
}

class SystemTimeProvider implements TimeProvider {
  @override
  DateTime now() => DateTime.now().toUtc();
}

/// 可注入的假时钟。注意：实例内部状态可变且不跨测试共享，
/// 请为每个测试创建新的实例（或使用 [reset] 重置）。
class MockTimeProvider implements TimeProvider {
  DateTime _now;
  MockTimeProvider(this._now);

  @override
  DateTime now() => _now;

  /// 把时钟向前推进 [duration]；负数会使时钟倒退，请确保单调递增。
  void advance(Duration duration) {
    assert(
      duration >= Duration.zero,
      'advance() 不接受负数 Duration（时钟只能向前）',
    );
    _now = _now.add(duration);
  }

  /// 重置时钟到指定时间（用于测试间复用实例时恢复现场）。
  void reset(DateTime time) {
    _now = time;
  }
}
