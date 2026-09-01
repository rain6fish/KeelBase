// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/search_result.dart';

class SearchRepository {
  final ApiClient _client;

  SearchRepository(this._client);

  Future<SearchResult> search(String q) async {
    final json = await _client.get('/search', queryParameters: {'q': q});
    final response = ApiResponse.fromJson(json, (data) => SearchResult.fromJson(data as Map<String, dynamic>));
    return response.data ?? const SearchResult();
  }
}
