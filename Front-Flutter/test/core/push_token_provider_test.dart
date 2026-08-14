import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/core/services/push_service.dart';
import 'package:front_app/core/services/push_token_provider.dart';

class MockApiClient extends Mock implements ApiClient {}

class _FakePushService implements PushService {
  final String? token;
  _FakePushService({this.token});
  @override
  Future<void> initialize() async {}
  @override
  Future<String?> getToken() async => token;
  @override
  Future<void> showNotification({required String title, required String body}) async {}
  @override
  bool get isAvailable => token != null;
}

void main() {
  late MockApiClient api;

  setUp(() {
    api = MockApiClient();
    when(() => api.post(any(), data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200});
    when(() => api.delete(any())).thenAnswer((_) async => {'code': 200});
  });

  test('NoopPushService：isAvailable false，不上报 token', () async {
    final provider = PushTokenProvider(api, NoopPushService());
    await provider.registerDevice();
    verifyNever(() => api.post(any(), data: any(named: 'data')));
  });

  test('真实 PushService：registerDevice 上报 token + platform + deviceId', () async {
    final provider = PushTokenProvider(
      api,
      _FakePushService(token: 'reg-123'),
      deviceIdProvider: () => 'dev-abc',
    );
    await provider.registerDevice();
    verify(() => api.post(
      '/push/tokens',
      data: any(named: 'data', that: isA<Map<String, dynamic>>()),
    )).called(1);
  });

  test('registerDevice 后 unregister 注销对应 token', () async {
    final provider = PushTokenProvider(api, _FakePushService(token: 'reg-123'));
    await provider.registerDevice();
    await provider.unregister();
    verify(() => api.delete('/push/tokens/reg-123')).called(1);
  });
}
