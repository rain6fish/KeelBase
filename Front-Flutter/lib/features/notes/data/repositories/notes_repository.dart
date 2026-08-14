import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/note_model.dart';

class NotesRepository {
  final ApiClient _client;

  NotesRepository(this._client);

  Future<List<NoteModel>> getNotes() async {
    final json = await _client.get('/notes');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => NoteModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<NoteModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/notes', data: data);
    final response = ApiResponse.fromJson(json, (data) => NoteModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/notes/$id');
  }
}
