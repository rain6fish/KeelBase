import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../../../core/api/sse_client.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/notification_model.dart';
import '../../data/repositories/notifications_repository.dart';

class NotificationsProvider extends ChangeNotifier {
  final NotificationsRepository _repository;
  final SseClient? _sseClient;
  final AppCache _cache;

  static const _ns = 'notifications';
  static const _keyList = 'list';
  static const _keyUnread = 'unread';

  List<NotificationModel> _notifications = [];
  int _unreadCount = 0;
  bool _loading = false;
  String? _error;
  StreamSubscription<Map<String, dynamic>>? _subscription;

  NotificationsProvider(this._repository, {this._sseClient, AppCache? cache})
      : _cache = cache ?? AppCache.unavailable();

  List<NotificationModel> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get loading => _loading;
  String? get error => _error;

  /// 订阅实时通知（SSE）。返回后新通知会实时插入列表。
  void subscribe() {
    final sse = _sseClient;
    if (sse == null || _subscription != null) return;
    _subscription = sse.postStream('/notifications/stream').listen(
      (event) {
        if (event['type'] != 'notification') return;
        final data = event['data'] as Map<String, dynamic>?;
        if (data == null) return;
        try {
          final n = NotificationModel.fromJson(data);
          _notifications = [n, ..._notifications];
          _unreadCount++;
          notifyListeners();
        } catch (_) {
          // 忽略解析失败的事件
        }
      },
      onError: (_) {
        _subscription = null; // 允许重试
      },
    );
  }

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    // 缓存优先：先展示本地缓存，避免空白
    final cached = await _cache.readList(_ns, _keyList);
    final cachedUnread = _cache.readInt(_ns, _keyUnread);
    if (cached != null) {
      _notifications = cached.map(NotificationModel.fromJson).toList();
      _unreadCount = cachedUnread ?? _notifications.where((n) => !n.isRead).length;
      notifyListeners();
    }

    try {
      _notifications = await _repository.getNotifications();
      _unreadCount = await _repository.getUnreadCount();
      await _cache.writeList(_ns, _keyList, _notifications.map((n) => n.toJson()).toList());
      await _cache.writeInt(_ns, _keyUnread, _unreadCount);
    } catch (e) {
      if (_notifications.isEmpty) _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> markRead(int id) async {
    try {
      await _repository.markRead(id);
      _notifications = _notifications
          .map((n) => n.id == id ? n.copyWith(isRead: true) : n)
          .toList();
      _unreadCount = _notifications.where((n) => !n.isRead).length;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    try {
      await _repository.markAllRead();
      _notifications = _notifications
          .map((n) => n.copyWith(isRead: true))
          .toList();
      _unreadCount = 0;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> delete(int id) async {
    try {
      await _repository.delete(id);
      _notifications = _notifications.where((n) => n.id != id).toList();
      _unreadCount = _notifications.where((n) => !n.isRead).length;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
