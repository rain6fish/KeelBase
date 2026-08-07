import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/notification_model.dart';

class NotificationsRepository {
  final ApiClient _client;

  NotificationsRepository(this._client);

  Future<List<NotificationModel>> getNotifications({int page = 1, int limit = 20}) async {
    final json = await _client.get('/notifications', queryParameters: {
      'page': page,
      'limit': limit,
    });
    final response = ApiResponse.fromJson(json, (data) {
      final items = (data as Map<String, dynamic>)['items'] as List? ?? [];
      return items
          .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
          .toList();
    });
    return response.data ?? [];
  }

  Future<int> getUnreadCount() async {
    final json = await _client.get('/notifications/unread-count');
    final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
    return (response.data?['count'] as int?) ?? 0;
  }

  Future<void> markRead(int id) async {
    await _client.patch('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _client.patch('/notifications/read-all');
  }

  Future<void> delete(int id) async {
    await _client.delete('/notifications/$id');
  }
}
