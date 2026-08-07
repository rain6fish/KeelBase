import 'package:flutter/foundation.dart';
import '../../data/models/conversation_summary.dart';
import '../../data/repositories/ai_conversation_repository.dart';

/// 对话历史列表状态管理。
class ConversationProvider extends ChangeNotifier {
  final AiConversationRepository _repository;

  List<ConversationSummary> _conversations = [];
  bool _loading = false;
  String? _error;

  ConversationProvider(this._repository);

  List<ConversationSummary> get conversations => _conversations;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _conversations = await _repository.getConversations();
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> delete(String id) async {
    try {
      await _repository.deleteConversation(id);
      _conversations = _conversations.where((c) => c.id != id).toList();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }
}
