// SPDX-License-Identifier: Apache-2.0

import 'api_client.dart';
import 'api_response.dart';
import 'app_provenance.dart';

/// GET /app/provenance（Public）—— 运行时来源指纹（来源身份 + 能力 + AI 工具指纹）。
class ProvenanceRepository {
  final ApiClient _client;

  ProvenanceRepository(this._client);

  Future<AppProvenance> getProvenance() async {
    final json = await _client.get('/app/provenance');
    final response = ApiResponse.fromJson(
      json,
      (data) => AppProvenance.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }
}
