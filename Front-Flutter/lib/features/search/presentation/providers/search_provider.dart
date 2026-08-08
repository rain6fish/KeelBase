import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../data/models/search_result.dart';
import '../../data/repositories/search_repository.dart';
import '../../../ai/data/models/conversation_summary.dart';
import '../../../ai/data/repositories/ai_conversation_repository.dart';

/// 全局搜索状态管理（PL-4.1：搜索历史 + AI 对话 Tab）。
class SearchProvider extends ChangeNotifier {
  final SearchRepository _repository;
  final AiConversationRepository? _conversationRepository;
  final SharedPreferences? _prefs;

  static const _historyKey = 'search_history';
  static const maxHistory = 10;
  static const hotKeywords = ['事件', '日程', '待办', 'AI'];

  SearchResult _result = const SearchResult();
  bool _loading = false;
  String? _error;
  String _query = '';
  List<String> _history = [];
  bool _historyLoaded = false;
  List<ConversationSummary> _conversations = [];
  bool _conversationsLoaded = false;

  // ignore: prefer_initializing_formals — 私有命名参数不能用 this._prefs
  SearchProvider(this._repository, {SharedPreferences? prefs, this._conversationRepository})
      : _prefs = prefs;

  SearchResult get result => _result;
  bool get loading => _loading;
  String? get error => _error;
  String get query => _query;
  List<String> get history => _history;
  bool get historyLoaded => _historyLoaded;
  List<ConversationSummary> get conversations => _conversations;
  bool get conversationsLoaded => _conversationsLoaded;

  /// 按关键词过滤对话历史（previewTitle / 消息内容）。
  List<ConversationSummary> get filteredConversations {
    if (_query.isEmpty) return [];
    final q = _query.toLowerCase();
    return _conversations.where((c) {
      if (c.previewTitle.toLowerCase().contains(q)) return true;
      return c.messages.any((m) => m.content.toLowerCase().contains(q));
    }).toList();
  }

  Future<void> loadHistory() async {
    if (_historyLoaded) return;
    _historyLoaded = true;
    final prefs = _prefs;
    if (prefs == null) return;
    _history = prefs.getStringList(_historyKey) ?? [];
    notifyListeners();
  }

  Future<void> addToHistory(String q) async {
    final query = q.trim();
    if (query.isEmpty) return;
    _history = [query, ..._history.where((h) => h != query)];
    if (_history.length > maxHistory) {
      _history = _history.sublist(0, maxHistory);
    }
    notifyListeners();
    await _prefs?.setStringList(_historyKey, _history);
  }

  Future<void> clearHistory() async {
    _history = [];
    notifyListeners();
    await _prefs?.remove(_historyKey);
  }

  Future<void> loadConversations() async {
    if (_conversationsLoaded) return;
    _conversationsLoaded = true;
    try {
      _conversations = await _conversationRepository?.getConversations() ?? [];
    } catch (_) {
      _conversations = [];
    }
    notifyListeners();
  }

  Future<void> search(String q) async {
    final query = q.trim();
    if (query.isEmpty) {
      _result = const SearchResult();
      _query = '';
      _error = null;
      notifyListeners();
      return;
    }

    _loading = true;
    _query = query;
    _error = null;
    notifyListeners();

    await addToHistory(query);

    try {
      _result = await _repository.search(query);
    } catch (e) {
      _error = e.toString();
      _result = const SearchResult();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void clear() {
    _result = const SearchResult();
    _query = '';
    _error = null;
    notifyListeners();
  }
}
