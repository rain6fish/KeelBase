import 'package:flutter/foundation.dart';
import '../../data/models/flow_task_model.dart';
import '../../data/repositories/flows_repository.dart';

/// 审批待办状态（FLOW-7）。
class FlowsProvider extends ChangeNotifier {
  final FlowsRepository _repository;

  List<FlowTaskModel> _tasks = [];
  bool _loading = false;
  String? _error;

  FlowsProvider(this._repository);

  List<FlowTaskModel> get tasks => _tasks;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _tasks = await _repository.getMyTasks();
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> approve(int id, String decision, {String? note}) async {
    try {
      await _repository.approve(id, decision, note: note);
      _tasks = _tasks.where((t) => t.id != id).toList();
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }
}
