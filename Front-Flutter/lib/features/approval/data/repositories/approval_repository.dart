// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/approval_models.dart';

/// My Requests 数据访问（单人额度校验）
class ApprovalRepository {
  final ApiClient _client;

  ApprovalRepository(this._client);

  Future<List<ApprovalRequestModel>> getRequests({String? status}) async {
    final json = await _client.get('/my-requests/requests', queryParameters: {
      if (status != null && status.isNotEmpty) 'status': status,
      'limit': '100',
    });
    final response = ApiResponse.fromJson(json, (data) {
      final items = (data as Map<String, dynamic>)['items'] as List? ?? [];
      return items.map((e) => ApprovalRequestModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<ApprovalRequestModel> createRequest(Map<String, dynamic> data) async {
    final json = await _client.post('/my-requests/requests', data: data);
    final response = ApiResponse.fromJson(json, (d) => ApprovalRequestModel.fromJson(d as Map<String, dynamic>));
    return response.data!;
  }

  Future<ApprovalRequestModel> reviewRequest(int id) async {
    final json = await _client.post('/my-requests/requests/$id/review');
    final response = ApiResponse.fromJson(json, (d) => ApprovalRequestModel.fromJson(d as Map<String, dynamic>));
    return response.data!;
  }

  Future<ApprovalRequestModel> decideRequest(int id, String decision) async {
    final json = await _client.post('/my-requests/requests/$id/decide', data: {'decision': decision});
    final response = ApiResponse.fromJson(json, (d) => ApprovalRequestModel.fromJson(d as Map<String, dynamic>));
    return response.data!;
  }

  Future<List<ApprovalPolicyModel>> getPolicies() async {
    final json = await _client.get('/my-requests/policies');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => ApprovalPolicyModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }
}
