// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/errors/exceptions.dart';
import '../models/book_model.dart';

class BooksRepository {
  final ApiClient _client;

  BooksRepository(this._client);

  /// 后端统一响应以 HTTP 状态码作为业务 code，2xx 视为成功。
  void _requireSuccess(ApiResponse response) {
    if (response.code < 200 || response.code >= 300) {
      throw NetworkException(response.message);
    }
  }

  Future<List<BookModel>> getBooks() async {
    final json = await _client.get('/books');
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! List) {
        throw NetworkException('Unexpected response format for /books');
      }
      return data.map((e) => BookModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    _requireSuccess(response);
    return response.data ?? [];
  }

  Future<BookModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/books', data: data);
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! Map<String, dynamic>) {
        throw NetworkException('Unexpected response format for /books');
      }
      return BookModel.fromJson(data);
    });
    _requireSuccess(response);
    final book = response.data;
    if (book == null) {
      throw NetworkException('Create book failed: empty response');
    }
    return book;
  }

  Future<void> delete(int id) async {
    final json = await _client.delete('/books/$id');
    final response = ApiResponse.fromJson(json, (_) => null);
    _requireSuccess(response);
  }
}
