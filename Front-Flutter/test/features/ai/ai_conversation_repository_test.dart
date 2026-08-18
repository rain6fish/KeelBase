import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/errors/exceptions.dart';
import 'package:front_app/features/ai/data/repositories/ai_conversation_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late AiConversationRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = AiConversationRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data, {int code = 200}) => {
        'code': code,
        'message': code == 200 ? 'ok' : 'error',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  group('getConversations', () {
    test('解析对话列表', () async {
      when(() => apiClient.get('/ai/conversations')).thenAnswer((_) async => res([
            {
              'id': 'c1',
              'messages': [
                {'role': 'user', 'content': 'hello'},
              ],
            },
          ]));
      final list = await repository.getConversations();
      expect(list.single.id, 'c1');
      expect(list.single.previewTitle, 'hello');
    });

    test('data 为 null 返回空列表', () async {
      when(() => apiClient.get('/ai/conversations')).thenAnswer((_) async => res(null));
      expect(await repository.getConversations(), isEmpty);
    });

    test('跳过畸形条目', () async {
      when(() => apiClient.get('/ai/conversations')).thenAnswer((_) async => res([
            {'id': 'good'},
            'bad',
            null,
            42,
          ]));
      final list = await repository.getConversations();
      expect(list.single.id, 'good');
    });

    test('data 非 List 抛 NetworkException', () async {
      when(() => apiClient.get('/ai/conversations')).thenAnswer((_) async => res({'id': 'x'}));
      expect(() => repository.getConversations(), throwsA(isA<NetworkException>()));
    });

    test('code 非 2xx 抛 NetworkException', () async {
      when(() => apiClient.get('/ai/conversations')).thenAnswer((_) async => res(null, code: 500));
      expect(() => repository.getConversations(), throwsA(isA<NetworkException>()));
    });
  });

  group('getConversation', () {
    test('解析单对话消息', () async {
      when(() => apiClient.get('/ai/conversations/c1')).thenAnswer((_) async => res({
            'id': 'c1',
            'messages': [
              {'role': 'user', 'content': 'hi'},
            ],
          }));
      final data = await repository.getConversation('c1');
      expect(data['id'], 'c1');
    });

    test('非法 id 抛 ValidationException', () async {
      for (final bad in ['', 'a/b', 'a?b', 'a#b', 'a..b']) {
        expect(() => repository.getConversation(bad), throwsA(isA<ValidationException>()),
            reason: 'id=$bad 应被拒绝');
      }
    });

    test('data 非 Map 抛 NetworkException', () async {
      when(() => apiClient.get('/ai/conversations/c1')).thenAnswer((_) async => res([1, 2]));
      expect(() => repository.getConversation('c1'), throwsA(isA<NetworkException>()));
    });
  });

  group('getTrace', () {
    test('解析执行轨迹', () async {
      when(() => apiClient.get('/ai/conversations/c1/trace')).thenAnswer((_) async => res({
            'conversation': {'id': 'c1'},
            'steps': [
              {'id': 's1', 'type': 'tool_call', 'time': 't'},
            ],
          }));
      final trace = await repository.getTrace('c1');
      expect(trace.id, 'c1');
      expect(trace.steps.single.isToolCall, isTrue);
    });

    test('data 非 Map 抛 NetworkException', () async {
      when(() => apiClient.get('/ai/conversations/c1/trace')).thenAnswer((_) async => res('oops'));
      expect(() => repository.getTrace('c1'), throwsA(isA<NetworkException>()));
    });
  });

  test('revokeEffect DELETE /ai/my/tool-effects/:id', () async {
    when(() => apiClient.delete('/ai/my/tool-effects/7')).thenAnswer((_) async => res(null));
    await repository.revokeEffect(7);
    verify(() => apiClient.delete('/ai/my/tool-effects/7')).called(1);
  });

  test('deleteConversation DELETE /ai/conversations/:id', () async {
    when(() => apiClient.delete('/ai/conversations/c1')).thenAnswer((_) async => res(null));
    await repository.deleteConversation('c1');
    verify(() => apiClient.delete('/ai/conversations/c1')).called(1);
  });

  test('deleteConversation 非法 id 抛 ValidationException', () async {
    expect(() => repository.deleteConversation('x/y'), throwsA(isA<ValidationException>()));
  });
}
