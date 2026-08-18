import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/notifications/data/repositories/notifications_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late NotificationsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = NotificationsRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getNotifications 分页参数 + 解析 items', () async {
    when(() => apiClient.get('/notifications', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({
              'items': [
                {'id': 1, 'title': '新通知', 'isRead': false},
              ],
            }));
    final list = await repository.getNotifications(page: 2, limit: 50);
    expect(list.single.title, '新通知');
    verify(() => apiClient.get('/notifications', queryParameters: {'page': 2, 'limit': 50})).called(1);
  });

  test('getNotifications 空列表返回空数组', () async {
    when(() => apiClient.get('/notifications', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res(null));
    expect(await repository.getNotifications(), isEmpty);
  });

  test('getUnreadCount 解析 count', () async {
    when(() => apiClient.get('/notifications/unread-count')).thenAnswer((_) async => res({'count': 3}));
    expect(await repository.getUnreadCount(), 3);
  });

  test('getUnreadCount 缺失 count 回退 0', () async {
    when(() => apiClient.get('/notifications/unread-count')).thenAnswer((_) async => res(<String, dynamic>{}));
    expect(await repository.getUnreadCount(), 0);
  });

  test('markRead PATCH /read', () async {
    when(() => apiClient.patch('/notifications/1/read')).thenAnswer((_) async => res(null));
    await repository.markRead(1);
    verify(() => apiClient.patch('/notifications/1/read')).called(1);
  });

  test('markAllRead PATCH /read-all', () async {
    when(() => apiClient.patch('/notifications/read-all')).thenAnswer((_) async => res(null));
    await repository.markAllRead();
    verify(() => apiClient.patch('/notifications/read-all')).called(1);
  });

  test('delete DELETE /notifications/:id', () async {
    when(() => apiClient.delete('/notifications/1')).thenAnswer((_) async => res(null));
    await repository.delete(1);
    verify(() => apiClient.delete('/notifications/1')).called(1);
  });
}
