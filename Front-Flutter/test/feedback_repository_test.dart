import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/feedback/data/repositories/feedback_repository.dart';
import 'helpers.dart';

void main() {
  late MockApiClient apiClient;
  late FeedbackRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = FeedbackRepository(apiClient);
  });

  test('提交反馈调用 POST /feedback 含类型与内容', () async {
    when(() => apiClient.post('/feedback', data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''});

    await repository.submit(type: 'bug', content: '登录页按钮错位');

    verify(() => apiClient.post(
      '/feedback',
      data: {
        'type': 'bug',
        'content': '登录页按钮错位',
      },
    )).called(1);
  });

  test('有联系方式时随请求提交', () async {
    when(() => apiClient.post('/feedback', data: any(named: 'data')))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''});

    await repository.submit(type: 'suggestion', content: '增加深色模式', contact: 'a@b.com');

    verify(() => apiClient.post(
      '/feedback',
      data: {
        'type': 'suggestion',
        'content': '增加深色模式',
        'contact': 'a@b.com',
      },
    )).called(1);
  });
}
