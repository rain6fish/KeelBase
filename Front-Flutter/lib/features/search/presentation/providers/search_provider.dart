import 'package:flutter/foundation.dart';
import '../../data/models/search_result.dart';
import '../../data/repositories/search_repository.dart';

/// 全局搜索状态管理
class SearchProvider extends ChangeNotifier {
  final SearchRepository _repository;

  SearchResult _result = const SearchResult();
  bool _loading = false;
  String? _error;
  String _query = '';

  SearchProvider(this._repository);

  SearchResult get result => _result;
  bool get loading => _loading;
  String? get error => _error;
  String get query => _query;

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
