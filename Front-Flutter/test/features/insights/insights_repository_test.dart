// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/insights/data/repositories/insights_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late InsightsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = InsightsRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getInsights 解析聚合统计', () async {
    when(() => apiClient.post('/ai/insights', data: any(named: 'data')))
        .thenAnswer((_) async => res({
              'stats': {
                'totalEvents': 100,
                'activeEvents': 60,
                'cancelledEvents': 10,
                'recentEvents': 5,
                'monthlyBreakdown': [
                  {'month': '2026-07', 'count': 12},
                ],
              },
              'summary': '本月事件活跃',
            }));
    final insights = await repository.getInsights();
    expect(insights.totalEvents, 100);
    expect(insights.activeEvents, 60);
    expect(insights.monthlyBreakdown.single.count, 12);
    expect(insights.summary, '本月事件活跃');
    verify(() => apiClient.post('/ai/insights', data: {'days': 30})).called(1);
  });

  test('getInsights 自定义 days', () async {
    when(() => apiClient.post('/ai/insights', data: any(named: 'data')))
        .thenAnswer((_) async => res({'stats': {}, 'summary': ''}));
    await repository.getInsights(days: 7);
    verify(() => apiClient.post('/ai/insights', data: {'days': 7})).called(1);
  });
}
