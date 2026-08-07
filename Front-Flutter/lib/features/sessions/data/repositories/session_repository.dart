import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/device_session_model.dart';

class SessionRepository {
  final ApiClient _client;

  SessionRepository(this._client);

  Future<List<DeviceSessionModel>> getSessions() async {
    final json = await _client.get('/auth/sessions');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items
          .map((e) => DeviceSessionModel.fromJson(e as Map<String, dynamic>))
          .toList();
    });
    return response.data ?? [];
  }

  /// 远程登出指定会话
  Future<void> revokeSession(int id) async {
    await _client.delete('/auth/sessions/$id');
  }
}
