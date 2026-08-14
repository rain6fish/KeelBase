import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/book_model.dart';

class BooksRepository {
  final ApiClient _client;

  BooksRepository(this._client);

  Future<List<BookModel>> getBooks() async {
    final json = await _client.get('/books');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => BookModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<BookModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/books', data: data);
    final response = ApiResponse.fromJson(json, (data) => BookModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/books/$id');
  }
}
