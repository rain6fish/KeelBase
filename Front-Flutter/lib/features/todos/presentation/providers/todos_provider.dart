import 'package:flutter/foundation.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/todo_model.dart';
import '../../data/repositories/todos_repository.dart';

/// 待办清单状态管理（UX-1：缓存优先 + 乐观更新）。
class TodosProvider extends ChangeNotifier {
  final TodosRepository _repository;
  final AppCache _cache;

  static const _ns = 'todos';
  static const _keyList = 'list';

  List<TodoModel> _todos = [];
  bool _loading = false;
  bool _fromCache = false;
  String? _error;

  TodosProvider(this._repository, {AppCache? cache})
      : _cache = cache ?? AppCache.unavailable();

  List<TodoModel> get todos => _todos;
  bool get loading => _loading;
  String? get error => _error;
  /// 当前数据是否来自离线缓存（网络未刷新成功）。
  bool get fromCache => _fromCache;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    // 缓存优先：先展示本地缓存，避免空白
    final cached = await _cache.readList(_ns, _keyList);
    if (cached != null) {
      _todos = cached.map(TodoModel.fromJson).toList();
      _fromCache = true;
      notifyListeners();
    }

    try {
      _todos = await _repository.getTodos();
      _fromCache = false;
      await _cache.writeList(_ns, _keyList, _todos.map((t) => t.toJson()).toList());
    } catch (e) {
      if (_todos.isEmpty) _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> add(String title) async {
    try {
      final todo = await _repository.create(title: title);
      _todos = [..._todos, todo];
      _error = null;
      notifyListeners();
      await _persist();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// 乐观更新：本地立即翻转完成状态，网络失败回滚。
  Future<bool> toggle(int id) async {
    final idx = _todos.indexWhere((t) => t.id == id);
    if (idx < 0) return false;
    final original = _todos[idx];
    final optimistic = original.copyWith(completed: !original.completed);

    // 立即更新 UI
    _todos = [..._todos]..[idx] = optimistic;
    _error = null;
    notifyListeners();

    try {
      final updated = await _repository.toggleComplete(id, optimistic.completed);
      _todos = _todos.map((t) => t.id == id ? updated : t).toList();
      notifyListeners();
      await _persist();
      return true;
    } catch (e) {
      // 失败回滚
      _todos = [..._todos]..[idx] = original;
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// 乐观更新：本地立即移除，网络失败恢复原列表。
  Future<bool> remove(int id) async {
    final originalList = _todos;
    _todos = _todos.where((t) => t.id != id).toList();
    _error = null;
    notifyListeners();

    try {
      await _repository.delete(id);
      await _persist();
      return true;
    } catch (e) {
      _todos = originalList;
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> _persist() async {
    await _cache.writeList(_ns, _keyList, _todos.map((t) => t.toJson()).toList());
  }
}
