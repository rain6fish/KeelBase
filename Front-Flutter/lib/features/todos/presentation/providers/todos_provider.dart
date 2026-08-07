import 'package:flutter/foundation.dart';
import '../../data/models/todo_model.dart';
import '../../data/repositories/todos_repository.dart';

/// 待办清单状态管理
class TodosProvider extends ChangeNotifier {
  final TodosRepository _repository;

  List<TodoModel> _todos = [];
  bool _loading = false;
  String? _error;

  TodosProvider(this._repository);

  List<TodoModel> get todos => _todos;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _todos = await _repository.getTodos();
    } catch (e) {
      _error = e.toString();
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
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> toggle(int id) async {
    final target = _todos.firstWhere((t) => t.id == id);
    try {
      final updated = await _repository.toggleComplete(id, target.completed);
      _todos = _todos.map((t) => t.id == id ? updated : t).toList();
      _error = null;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> remove(int id) async {
    try {
      await _repository.delete(id);
      _todos = _todos.where((t) => t.id != id).toList();
      _error = null;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }
}
