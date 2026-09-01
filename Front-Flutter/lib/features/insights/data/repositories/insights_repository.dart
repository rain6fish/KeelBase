// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/insights_model.dart';

class InsightsRepository {
  final ApiClient _client;

  InsightsRepository(this._client);

  Future<InsightsModel> getInsights({int days = 30}) async {
    final json = await _client.post('/ai/insights', data: {'days': days});
    final response =
        ApiResponse.fromJson(json, (data) => InsightsModel.fromJson(data));
    return response.data!;
  }
}
