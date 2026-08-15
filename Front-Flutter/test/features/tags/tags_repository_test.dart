import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/tags/data/repositories/tags_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late TagsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = TagsRepository(apiClient);
  });

  test('getTags 解析标签列表', () async {
    when(() => apiClient.get('/tags')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {'id': 1, 'name': '工作'},
        {'id': 2, 'name': '生活'},
      ],
      'timestamp': '',
    });
    final tags = await repository.getTags();
    expect(tags, hasLength(2));
    expect(tags.first.name, '工作');
  });

  test('create POST /tags 返回 TagModel', () async {
    when(() => apiClient.post('/tags', data: any(named: 'data')))
        .thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'data': {'id': 5, 'name': '重要'},
          'timestamp': '',
        });
    final tag = await repository.create({'name': '重要'});
    expect(tag.id, 5);
    verify(() => apiClient.post('/tags', data: {'name': '重要'})).called(1);
  });

  test('delete DELETE /tags/:id', () async {
    when(() => apiClient.delete('/tags/5')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': null,
      'timestamp': '',
    });
    await repository.delete(5);
    verify(() => apiClient.delete('/tags/5')).called(1);
  });
}
