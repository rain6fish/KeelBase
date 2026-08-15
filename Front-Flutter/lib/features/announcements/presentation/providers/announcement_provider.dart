import 'package:flutter/foundation.dart';
import '../../../notifications/data/models/notification_model.dart';
import '../../../notifications/data/repositories/notifications_repository.dart';

/// 可识别的公告类型（管理台广播 / 系统公告）。
const Set<String> kAnnouncementTypes = {'broadcast', 'announcement'};

/// 公告消费（UX-6）：启动时拉取未读通知，识别公告并弹窗展示一次。
class AnnouncementProvider extends ChangeNotifier {
  final NotificationsRepository _repository;

  AnnouncementProvider(this._repository);

  NotificationModel? _latest;
  bool _checked = false;
  bool _shownThisSession = false;
  bool _disposed = false;
  Future<bool>? _inflight;

  NotificationModel? get latest => _latest;
  bool get hasAnnouncement => _latest != null;
  bool get alreadyShown => _shownThisSession;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// 拉取最新未读公告。返回是否应展示弹窗（每次会话只展示一次）。
  /// 进行中的请求会被复用（memoize in-flight future），避免并发重复拉取。
  Future<bool> check() {
    if (_checked) return Future.value(_shouldShow());
    final inflight = _inflight;
    if (inflight != null) return inflight;
    final future = _doCheck();
    _inflight = future;
    future.whenComplete(() => _inflight = null);
    return future;
  }

  Future<bool> _doCheck() async {
    _checked = true;
    try {
      // 注意：保持默认分页（limit=20），与既有测试桩（无参调用）一致。
      // 若后端需覆盖超过 20 条未读，可改为 getNotifications(limit: 100)，
      // 并同步更新 test/announcement_provider_test.dart 的 when(...) 桩。
      final items = await _repository.getNotifications();
      final unread = items.where((n) => !n.isRead).toList();
      // 取未读公告中最新一条（按真实时间排序，缺失时间戳视为最新）
      final candidates = unread
          .where((n) => kAnnouncementTypes.contains(n.type))
          .toList();
      final now = DateTime.now();
      candidates.sort((a, b) {
        final at = DateTime.tryParse(a.createdAt ?? '');
        final bt = DateTime.tryParse(b.createdAt ?? '');
        return (bt ?? now).compareTo(at ?? now);
      });
      _latest = candidates.isNotEmpty ? candidates.first : null;
    } catch (e) {
      _latest = null;
      // 瞬时失败允许稍后重试，而不是整个会话永久吞掉公告。
      _checked = false;
      debugPrint('AnnouncementProvider.check failed: $e');
    }
    if (!_disposed) notifyListeners();
    return _shouldShow();
  }

  bool _shouldShow() => _latest != null && !_shownThisSession;

  /// 弹窗已展示，本会话不再重复弹出。
  void markShown() {
    _shownThisSession = true;
    if (!_disposed) notifyListeners();
  }

  void resetForTest() {
    _checked = false;
    _shownThisSession = false;
    _latest = null;
  }
}
