// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/flow_task_model.dart';

class FlowsRepository {
  final ApiClient _client;

  FlowsRepository(this._client);

  Future<List<FlowTaskModel>> getMyTasks() async {
    final json = await _client.get('/flows/tasks');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items
          .map((e) => FlowTaskModel.fromJson(e as Map<String, dynamic>))
          .toList();
    });
    return response.data ?? [];
  }

  Future<void> approve(int id, String decision, {String? note}) async {
    await _client.post('/flows/tasks/$id/approve', data: {
      'decision': decision,
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }
}
