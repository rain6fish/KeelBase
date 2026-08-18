import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/sessions/data/repositories/session_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late SessionRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = SessionRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getSessions 解析设备列表', () async {
    when(() => apiClient.get('/auth/sessions')).thenAnswer((_) async => res([
          {'id': 1, 'deviceName': 'iPhone', 'isCurrent': true},
        ]));
    final list = await repository.getSessions();
    expect(list.single.deviceName, 'iPhone');
    expect(list.single.isCurrent, isTrue);
  });

  test('getSessions 空列表返回空数组', () async {
    when(() => apiClient.get('/auth/sessions')).thenAnswer((_) async => res(null));
    expect(await repository.getSessions(), isEmpty);
  });

  test('revokeSession DELETE /auth/sessions/:id', () async {
    when(() => apiClient.delete('/auth/sessions/1')).thenAnswer((_) async => res(null));
    await repository.revokeSession(1);
    verify(() => apiClient.delete('/auth/sessions/1')).called(1);
  });
}
