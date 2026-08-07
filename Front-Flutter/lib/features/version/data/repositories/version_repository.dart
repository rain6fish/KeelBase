import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/app_version_info.dart';

class VersionRepository {
  final ApiClient _client;

  VersionRepository(this._client);

  Future<AppVersionInfo> getVersionInfo() async {
    final json = await _client.get('/app/version');
    final response = ApiResponse.fromJson(
      json,
      (data) => AppVersionInfo.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }
}
