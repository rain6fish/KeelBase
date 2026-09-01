// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/notifications/data/models/notification_model.dart';
import 'package:front_app/features/announcements/presentation/providers/announcement_provider.dart';
import 'helpers.dart';

NotificationModel makeNotification(int id, {String type = 'system', bool isRead = false, String? createdAt}) {
  return NotificationModel(id: id, title: '公告 $id', body: '内容', type: type, isRead: isRead, createdAt: createdAt);
}

void main() {
  late MockNotificationsRepository repository;
  late AnnouncementProvider provider;

  setUp(() {
    repository = MockNotificationsRepository();
    provider = AnnouncementProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  test('无公告时 hasAnnouncement=false 且不弹窗', () async {
    when(() => repository.getNotifications()).thenAnswer((_) async => [
      makeNotification(1, type: 'system'),
    ]);

    final show = await provider.check();

    expect(provider.hasAnnouncement, false);
    expect(show, false);
  });

  test('存在未读公告时识别最新一条并应弹窗', () async {
    when(() => repository.getNotifications()).thenAnswer((_) async => [
      makeNotification(1, type: 'broadcast', isRead: true, createdAt: '2026-08-01'),
      makeNotification(2, type: 'announcement', isRead: false, createdAt: '2026-08-02'),
      makeNotification(3, type: 'system', isRead: false, createdAt: '2026-08-03'),
    ]);

    final show = await provider.check();

    expect(provider.hasAnnouncement, true);
    expect(provider.latest!.id, 2);
    expect(provider.latest!.type, 'announcement');
    expect(show, true);
  });

  test('markShown 后同一会话不再弹窗', () async {
    when(() => repository.getNotifications()).thenAnswer((_) async => [
      makeNotification(1, type: 'broadcast'),
    ]);

    expect(await provider.check(), true);
    provider.markShown();
    expect(await provider.check(), false);
  });

  test('拉取失败时静默降级，不弹窗不抛错', () async {
    when(() => repository.getNotifications()).thenThrow(Exception('network'));

    final show = await provider.check();

    expect(show, false);
    expect(provider.hasAnnouncement, false);
  });

  test('已读公告不弹窗', () async {
    when(() => repository.getNotifications()).thenAnswer((_) async => [
      makeNotification(1, type: 'broadcast', isRead: true),
    ]);

    expect(await provider.check(), false);
  });
}
