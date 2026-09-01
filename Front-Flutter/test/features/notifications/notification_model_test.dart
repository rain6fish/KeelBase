// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/notifications/data/models/notification_model.dart';

void main() {
  group('NotificationModel.fromJson', () {
    test('parses targetType and targetId', () {
      final json = <String, dynamic>{
        'id': 1,
        'title': '事件提醒',
        'body': '会议',
        'type': 'reminder',
        'targetType': 'event',
        'targetId': '5',
        'isRead': false,
        'link': '/events/5',
        'createdAt': '2026-08-06T03:00:00Z',
      };

      final model = NotificationModel.fromJson(json);

      expect(model.targetType, 'event');
      expect(model.targetId, '5');
      expect(model.link, '/events/5');
    });

    test('defaults target fields to null when absent', () {
      final json = <String, dynamic>{
        'id': 2,
        'title': '系统通知',
        'type': 'system',
      };

      final model = NotificationModel.fromJson(json);

      expect(model.targetType, isNull);
      expect(model.targetId, isNull);
    });

    test('copyWith preserves target fields', () {
      final model = NotificationModel.fromJson(<String, dynamic>{
        'id': 1,
        'title': '事件提醒',
        'type': 'reminder',
        'targetType': 'event',
        'targetId': '5',
      });

      final updated = model.copyWith(isRead: true);

      expect(updated.targetType, 'event');
      expect(updated.targetId, '5');
      expect(updated.isRead, true);
    });
  });
}
