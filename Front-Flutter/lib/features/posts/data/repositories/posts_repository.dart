import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/post_model.dart';

class PostsRepository {
  final ApiClient _client;

  PostsRepository(this._client);

  Future<List<PostModel>> getPosts() async {
    final json = await _client.get('/posts');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => PostModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<PostModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/posts', data: data);
    final response = ApiResponse.fromJson(json, (data) => PostModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/posts/$id');
  }
}
