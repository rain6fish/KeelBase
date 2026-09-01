// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/app_capabilities.dart';
import 'package:front_app/core/api/capabilities_provider.dart';
import 'package:front_app/core/api/capabilities_repository.dart';
import '../../helpers.dart';

class MockCapabilitiesRepository extends Mock implements CapabilitiesRepository {}

void main() {
  group('CapabilitiesRepository', () {
    test('getCapabilities 解析预设/开关/模块', () async {
      final apiClient = MockApiClient();
      final repository = CapabilitiesRepository(apiClient);
      when(() => apiClient.get('/app/capabilities')).thenAnswer((_) async => {
            'code': 200,
            'message': 'ok',
            'data': {
              'preset': 'full',
              'features': {'ai': true},
              'businessModules': [
                {'id': 'events', 'label': '事件'},
              ],
            },
            'timestamp': '2026-08-15T10:00:00Z',
          });
      final caps = await repository.getCapabilities();
      expect(caps.preset, 'full');
      expect(caps.isFeatureEnabled('ai'), isTrue);
      expect(caps.businessModules.single.label, '事件');
      verify(() => apiClient.get('/app/capabilities')).called(1);
    });
  });
  late MockCapabilitiesRepository repo;
  late CapabilitiesProvider provider;

  setUp(() {
    repo = MockCapabilitiesRepository();
    provider = CapabilitiesProvider(repo);
  });

  AppCapabilities caps() => AppCapabilities(
        preset: 'lite',
        features: {'ai': true, 'search': false},
        businessModules: const [
          BusinessModule(id: 'events', label: '事件'),
          BusinessModule(id: 'todos', label: '待办'),
        ],
      );

  test('未加载时默认全部开启', () {
    expect(provider.capabilities, isNull);
    expect(provider.isFeatureEnabled('anything'), isTrue);
    expect(provider.hasBusinessModule('anything'), isTrue);
  });

  test('load 成功拉取并 notifyListeners', () async {
    var notified = false;
    provider.addListener(() => notified = true);
    when(() => repo.getCapabilities()).thenAnswer((_) async => caps());
    await provider.load();
    expect(notified, isTrue);
    expect(provider.capabilities?.preset, 'lite');
    expect(provider.isFeatureEnabled('ai'), isTrue);
    expect(provider.isFeatureEnabled('search'), isFalse);
    expect(provider.hasBusinessModule('events'), isTrue);
    expect(provider.hasBusinessModule('posts'), isFalse);
  });

  test('load 失败保持 null → 默认全开', () async {
    when(() => repo.getCapabilities()).thenThrow(Exception('网络错误'));
    await provider.load();
    expect(provider.capabilities, isNull);
    expect(provider.isFeatureEnabled('x'), isTrue);
    expect(provider.hasBusinessModule('x'), isTrue);
  });
}
