import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/tag_model.dart';

class TagsRepository {
  final ApiClient _client;

  TagsRepository(this._client);

  Future<List<TagModel>> getTags() async {
    final json = await _client.get('/tags');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => TagModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<TagModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/tags', data: data);
    final response = ApiResponse.fromJson(json, (data) => TagModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/tags/$id');
  }
}
