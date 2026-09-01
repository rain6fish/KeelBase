// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/todos/data/repositories/todos_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late TodosRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = TodosRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getTodos 解析列表', () async {
    when(() => apiClient.get('/todos')).thenAnswer((_) async => res([
          {'id': 1, 'title': '买菜', 'completed': false},
        ]));
    final list = await repository.getTodos();
    expect(list.single.title, '买菜');
  });

  test('getTodos 空列表返回空数组', () async {
    when(() => apiClient.get('/todos')).thenAnswer((_) async => res(null));
    expect(await repository.getTodos(), isEmpty);
  });

  test('create 带 description', () async {
    when(() => apiClient.post('/todos', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 2, 'title': '买菜', 'completed': false}));
    final t = await repository.create(title: '买菜', description: '清单');
    expect(t.id, 2);
    verify(() => apiClient.post('/todos', data: {'title': '买菜', 'description': '清单'})).called(1);
  });

  test('create 空 description 不带字段', () async {
    when(() => apiClient.post('/todos', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 3, 'title': 't', 'completed': false}));
    await repository.create(title: 't', description: '');
    verify(() => apiClient.post('/todos', data: {'title': 't'})).called(1);
  });

  test('toggleComplete 传取反后的 completed', () async {
    when(() => apiClient.patch('/todos/1/complete', data: any(named: 'data')))
        .thenAnswer((_) async => res({'id': 1, 'title': 't', 'completed': true}));
    final t = await repository.toggleComplete(1, false);
    expect(t.completed, isTrue);
    // 当前未完成 → 请求置完成（completed: !false = true）
    verify(() => apiClient.patch('/todos/1/complete', data: {'completed': true})).called(1);
  });

  test('delete DELETE /todos/:id', () async {
    when(() => apiClient.delete('/todos/1')).thenAnswer((_) async => res(null));
    await repository.delete(1);
    verify(() => apiClient.delete('/todos/1')).called(1);
  });
}
