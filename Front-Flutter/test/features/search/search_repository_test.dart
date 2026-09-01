// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/search/data/repositories/search_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late SearchRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = SearchRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('search 传 q 参数并解析事件/用户', () async {
    when(() => apiClient.get('/search', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res({
              'events': {
                'items': [
                  {
                    'id': 1,
                    'title': '会议',
                    'startTime': '2026-08-16T09:00:00.000Z',
                    'endTime': '2026-08-16T10:00:00.000Z',
                    'createdAt': '2026-08-01T00:00:00.000Z',
                    'updatedAt': '2026-08-01T00:00:00.000Z',
                  },
                ],
              },
              'users': {
                'items': [
                  {'id': 2, 'username': 'alex', 'nickname': 'Alex'},
                ],
              },
            }));
    final result = await repository.search('会议');
    expect(result.events.single.title, '会议');
    expect(result.users.single.username, 'alex');
    verify(() => apiClient.get('/search', queryParameters: {'q': '会议'})).called(1);
  });

  test('search data 缺失回退空结果', () async {
    when(() => apiClient.get('/search', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res(null));
    final result = await repository.search('x');
    expect(result.events, isEmpty);
    expect(result.users, isEmpty);
  });
}
