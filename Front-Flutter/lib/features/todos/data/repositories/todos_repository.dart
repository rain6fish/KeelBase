import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/todo_model.dart';

class TodosRepository {
  final ApiClient _client;

  TodosRepository(this._client);

  Future<List<TodoModel>> getTodos() async {
    final json = await _client.get('/todos');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => TodoModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<TodoModel> create({required String title, String? description}) async {
    final json = await _client.post('/todos', data: {
      'title': title,
      if (description != null && description.isNotEmpty) 'description': description,
    });
    final response = ApiResponse.fromJson(json, (data) => TodoModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<TodoModel> toggleComplete(int id, bool completed) async {
    final json = await _client.patch('/todos/$id/complete', data: {'completed': !completed});
    final response = ApiResponse.fromJson(json, (data) => TodoModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/todos/$id');
  }
}
