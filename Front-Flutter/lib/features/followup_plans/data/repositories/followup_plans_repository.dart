// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/followup_plan_model.dart';

class FollowupPlansRepository {
  final ApiClient _client;

  FollowupPlansRepository(this._client);

  Future<List<FollowupPlanModel>> getFollowupPlans() async {
    final json = await _client.get('/followup_plans');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => FollowupPlanModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<FollowupPlanModel> create(Map<String, dynamic> data) async {
    final json = await _client.post('/followup_plans', data: data);
    final response = ApiResponse.fromJson(json, (data) => FollowupPlanModel.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/followup_plans/$id');
  }
}
