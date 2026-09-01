// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/notifications/data/models/notification_model.dart';
import 'package:front_app/features/notifications/presentation/providers/notifications_provider.dart';
import '../../helpers.dart';

void main() {
  late MockNotificationsRepository repository;
  late MockSseClient sseClient;
  late NotificationsProvider provider;

  NotificationModel makeNotification(int id, {bool isRead = false}) {
    return NotificationModel(
      id: id,
      title: '通知 $id',
      body: '内容',
      isRead: isRead,
    );
  }

  setUp(() {
    repository = MockNotificationsRepository();
    sseClient = MockSseClient();
    provider = NotificationsProvider(repository, sseClient: sseClient);
  });

  tearDown(() {
    provider.dispose();
  });

  group('load', () {
    test('成功 → 填充列表和未读数', () async {
      when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
          .thenAnswer((_) async => [makeNotification(1), makeNotification(2)]);
      when(() => repository.getUnreadCount()).thenAnswer((_) async => 2);

      await provider.load();

      expect(provider.notifications.length, 2);
      expect(provider.unreadCount, 2);
      expect(provider.loading, isFalse);
      expect(provider.error, isNull);
    });

    test('失败 → error 设置', () async {
      when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
          .thenThrow(Exception('network error'));
      when(() => repository.getUnreadCount()).thenAnswer((_) async => 0);

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.loading, isFalse);
    });
  });

  group('markRead', () {
    test('标记单条已读 → 更新列表和未读数', () async {
      when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
          .thenAnswer((_) async => [makeNotification(1), makeNotification(2)]);
      when(() => repository.getUnreadCount()).thenAnswer((_) async => 2);
      await provider.load();

      when(() => repository.markRead(1)).thenAnswer((_) async => null);

      await provider.markRead(1);

      expect(provider.notifications[0].isRead, isTrue);
      expect(provider.unreadCount, 1);
    });
  });

  group('markAllRead', () {
    test('全部已读 → 未读数归零', () async {
      when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
          .thenAnswer((_) async => [makeNotification(1), makeNotification(2)]);
      when(() => repository.getUnreadCount()).thenAnswer((_) async => 2);
      await provider.load();

      when(() => repository.markAllRead()).thenAnswer((_) async => null);

      await provider.markAllRead();

      expect(provider.notifications.every((n) => n.isRead), isTrue);
      expect(provider.unreadCount, 0);
    });
  });

  group('delete', () {
    test('删除 → 列表移除、未读数更新', () async {
      when(() => repository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
          .thenAnswer((_) async => [
                makeNotification(1, isRead: true),
                makeNotification(2),
              ]);
      when(() => repository.getUnreadCount()).thenAnswer((_) async => 1);
      await provider.load();

      when(() => repository.delete(1)).thenAnswer((_) async => null);

      await provider.delete(1);

      expect(provider.notifications.length, 1);
      expect(provider.notifications[0].id, 2);
      expect(provider.unreadCount, 1);
    });
  });

  group('subscribe', () {
    test('收到实时通知 → 插入列表、未读数+1', () async {
      final controller = StreamController<Map<String, dynamic>>();
      when(() => sseClient.postStream(
            '/notifications/stream',
            reconnect: any(named: 'reconnect'),
            maxAttempts: any(named: 'maxAttempts'),
          )).thenAnswer((_) => controller.stream);

      provider.subscribe();

      controller.add({
        'type': 'notification',
        'data': {'id': 99, 'title': '实时通知', 'type': 'system', 'isRead': false},
      });
      await Future<void>.delayed(Duration.zero);

      expect(provider.notifications.length, 1);
      expect(provider.notifications[0].title, '实时通知');
      expect(provider.unreadCount, 1);

      await controller.close();
    });

    test('无 SseClient 时 subscribe 不报错', () {
      final bare = NotificationsProvider(repository);
      bare.subscribe(); // 不应抛错
      bare.dispose();
    });
  });
}
