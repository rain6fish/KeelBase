// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/report_model.dart';

class ReportsRepository {
  final ApiClient _client;

  ReportsRepository(this._client);

  Future<List<ReportModel>> getReports() async {
    final json = await _client.get('/reports');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => ReportModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<ReportModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/reports', data: data);
    final response = ApiResponse.fromJson(json, (data) => ReportModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/reports/$id');
  }
}
