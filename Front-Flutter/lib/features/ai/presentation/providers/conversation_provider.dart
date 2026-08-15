import 'package:flutter/foundation.dart';
import '../../data/models/conversation_summary.dart';
import '../../data/repositories/ai_conversation_repository.dart';

/// 对话历史列表状态管理。
class ConversationProvider extends ChangeNotifier {
  final AiConversationRepository _repository;

  List<ConversationSummary> _conversations = [];
  bool _loading = false;
  String? _error;
  int _loadGeneration = 0;
  int _pendingLoads = 0;
  bool _disposed = false;

  ConversationProvider(this._repository);

  List<ConversationSummary> get conversations =>
      List.unmodifiable(_conversations);
  bool get loading => _loading;
  String? get error => _error;

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    final generation = ++_loadGeneration;
    _pendingLoads++;
    _loading = true;
    _error = null;
    _safeNotify();
    try {
      final result = await _repository.getConversations();
      if (generation != _loadGeneration) return; // 忽略过期/被删除失效的响应
      _conversations = result;
    } catch (e) {
      if (generation != _loadGeneration) return;
      _error = e.toString();
      // 保留旧列表作为离线缓存（错误由 UI 层在空列表时展示错误视图）
    } finally {
      _pendingLoads--;
      if (_pendingLoads == 0) {
        _loading = false;
      }
      _safeNotify();
    }
  }

  /// 删除对话：先同步本地移除（满足 Dismissible 同帧移除要求），再调服务端删除。
  /// 服务端失败时回滚本地移除；同时使进行中的 load 失效，避免旧响应复活已删除项。
  Future<void> delete(String id) async {
    _loadGeneration++; // 使 in-flight load 失效
    final index = _conversations.indexWhere((c) => c.id == id);
    final removed = index >= 0 ? _conversations[index] : null;
    if (removed != null) {
      _conversations = [..._conversations]..removeAt(index);
      _safeNotify();
    }
    try {
      await _repository.deleteConversation(id);
    } catch (e) {
      if (removed != null && !_conversations.any((c) => c.id == id)) {
        final at = index < _conversations.length ? index : _conversations.length;
        _conversations = [..._conversations]..insert(at, removed);
      }
      _error = e.toString();
      _safeNotify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
