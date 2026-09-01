// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/sessions/data/models/device_session_model.dart';
import 'package:front_app/features/sessions/presentation/providers/session_provider.dart';
import '../../helpers.dart';

void main() {
  late MockSessionRepository repository;
  late SessionProvider provider;

  const current = DeviceSessionModel(
    id: 1,
    deviceName: 'Windows',
    isCurrent: true,
  );
  const remote = DeviceSessionModel(
    id: 2,
    deviceName: 'iPhone',
    isCurrent: false,
  );

  setUp(() {
    repository = MockSessionRepository();
    provider = SessionProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  group('load', () {
    test('成功 → 填充会话列表', () async {
      when(() => repository.getSessions()).thenAnswer((_) async => [current, remote]);

      await provider.load();

      expect(provider.loading, isFalse);
      expect(provider.sessions.length, 2);
      expect(provider.sessions[1].deviceName, 'iPhone');
      expect(provider.error, isNull);
    });

    test('失败 → error 设置', () async {
      when(() => repository.getSessions()).thenThrow(Exception('network error'));

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.sessions, isEmpty);
    });
  });

  group('revoke', () {
    test('成功 → 从列表移除', () async {
      when(() => repository.getSessions()).thenAnswer((_) async => [current, remote]);
      await provider.load();

      when(() => repository.revokeSession(2)).thenAnswer((_) async => null);

      final ok = await provider.revoke(2);

      expect(ok, isTrue);
      expect(provider.sessions.length, 1);
      expect(provider.sessions[0].id, 1);
    });

    test('失败 → 返回 false，列表不变', () async {
      when(() => repository.getSessions()).thenAnswer((_) async => [current, remote]);
      await provider.load();

      when(() => repository.revokeSession(2)).thenThrow(Exception('server error'));

      final ok = await provider.revoke(2);

      expect(ok, isFalse);
      expect(provider.sessions.length, 2);
      expect(provider.error, isNotNull);
    });
  });
}
