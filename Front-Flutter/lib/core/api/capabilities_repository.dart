import 'api_client.dart';
import 'api_response.dart';
import 'app_capabilities.dart';

/// GET /app/capabilities（Public）——预设 + 功能开关 + 启用业务模块。
class CapabilitiesRepository {
  final ApiClient _client;

  CapabilitiesRepository(this._client);

  Future<AppCapabilities> getCapabilities() async {
    final json = await _client.get('/app/capabilities');
    final response = ApiResponse.fromJson(
      json,
      (data) => AppCapabilities.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }
}
