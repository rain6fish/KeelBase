import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/project_model.dart';

/// AI Project Management 数据访问
class PmRepository {
  final ApiClient _client;

  PmRepository(this._client);

  Future<List<ProjectModel>> getProjects({String? status, String? keyword}) async {
    final json = await _client.get('/pm/projects', queryParameters: {
      if (status != null && status.isNotEmpty) 'status': status,
      if (keyword != null && keyword.isNotEmpty) 'keyword': keyword,
      'limit': '100',
    });
    final response = ApiResponse.fromJson(json, (data) {
      final items = (data as Map<String, dynamic>)['items'] as List? ?? [];
      return items.map((e) => ProjectModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<ProjectDetailModel> getProjectDetail(int id) async {
    final json = await _client.get('/pm/projects/$id');
    final response = ApiResponse.fromJson(
      json,
      (data) => ProjectDetailModel.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<ProjectModel> createProject(Map<String, dynamic> data) async {
    final json = await _client.post('/pm/projects', data: data);
    final response = ApiResponse.fromJson(json, (d) => ProjectModel.fromJson(d as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> deleteProject(int id) async {
    await _client.delete('/pm/projects/$id');
  }

  Future<void> createMilestone(int projectId, Map<String, dynamic> data) async {
    await _client.post('/pm/projects/$projectId/milestones', data: data);
  }

  Future<void> createTask({required int projectId, required String title, String? dueDate}) async {
    await _client.post('/pm/tasks', data: {
      'projectId': projectId,
      'title': title,
      if (dueDate != null) 'dueDate': dueDate,
    });
  }

  Future<void> completeTask(int id) async {
    await _client.post('/pm/tasks/$id/complete');
  }
}
