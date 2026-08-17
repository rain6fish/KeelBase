import 'package:flutter/foundation.dart';
import '../../data/repositories/pm_repository.dart';
import '../../data/models/project_model.dart';

/// AI Project Management：项目列表 + 详情状态管理
class PmProvider extends ChangeNotifier {
  final PmRepository _repository;

  List<ProjectModel> _projects = [];
  ProjectDetailModel? _detail;
  bool _loading = false;
  String? _error;

  PmProvider(this._repository);

  List<ProjectModel> get projects => _projects;
  ProjectDetailModel? get detail => _detail;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> loadProjects() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _projects = await _repository.getProjects();
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> loadDetail(int id) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _detail = await _repository.getProjectDetail(id);
      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> createProject(Map<String, dynamic> data) async {
    try {
      await _repository.createProject(data);
      await loadProjects();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteProject(int id) async {
    try {
      await _repository.deleteProject(id);
      await loadProjects();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addMilestone(int projectId, Map<String, dynamic> data) async {
    try {
      await _repository.createMilestone(projectId, data);
      await loadDetail(projectId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addTask(int projectId, String title) async {
    try {
      await _repository.createTask(projectId: projectId, title: title);
      await loadDetail(projectId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> completeTask(int id) async {
    try {
      await _repository.completeTask(id);
      if (_detail != null) await loadDetail(_detail!.project.id);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }
}
