import 'package:flutter/foundation.dart';
import '../../../notifications/data/models/notification_model.dart';
import '../../../notifications/data/repositories/notifications_repository.dart';

/// 可识别的公告类型（管理台广播 / 系统公告）。
const Set<String> kAnnouncementTypes = {'broadcast', 'announcement'};

/// 公告消费（UX-6）：启动时拉取未读通知，识别公告并弹窗展示一次。
class AnnouncementProvider extends ChangeNotifier {
  final NotificationsRepository _repository;

  AnnouncementProvider(this._repository);

  NotificationModel? latest;
  bool _checked = false;
  bool _shownThisSession = false;

  bool get hasAnnouncement => latest != null;
  bool get alreadyShown => _shownThisSession;

  /// 拉取最新未读公告。返回是否应展示弹窗（每次会话只展示一次）。
  Future<bool> check() async {
    if (_checked) return _shouldShow();
    _checked = true;
    try {
      final items = await _repository.getNotifications();
      final unread = items.where((n) => !n.isRead).toList();
      // 取未读公告中最新一条
      final candidates = unread
          .where((n) => kAnnouncementTypes.contains(n.type))
          .toList();
      candidates.sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
      latest = candidates.isNotEmpty ? candidates.first : null;
    } catch (_) {
      latest = null;
    }
    notifyListeners();
    return _shouldShow();
  }

  bool _shouldShow() => latest != null && !_shownThisSession;

  /// 弹窗已展示，本会话不再重复弹出。
  void markShown() {
    _shownThisSession = true;
  }

  void resetForTest() {
    _checked = false;
    _shownThisSession = false;
    latest = null;
  }
}
