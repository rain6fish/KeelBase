import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/insights/data/models/insights_model.dart';
import 'package:front_app/features/insights/data/repositories/insights_repository.dart';
import 'package:front_app/features/insights/presentation/providers/insights_provider.dart';
import 'helpers.dart';

void main() {
  group('InsightsModel', () {
    test('fromJson 解析 stats 与 monthlyBreakdown', () {
      final model = InsightsModel.fromJson(const {
        'stats': {
          'totalEvents': 10,
          'activeEvents': 8,
          'cancelledEvents': 2,
          'recentEvents': 5,
          'monthlyBreakdown': [
            {'month': '2026-06', 'count': 4},
            {'month': '2026-07', 'count': 6},
          ],
        },
        'summary': 'you have 10 events',
      });
      expect(model.totalEvents, 10);
      expect(model.activeEvents, 8);
      expect(model.cancelledEvents, 2);
      expect(model.recentEvents, 5);
      expect(model.monthlyBreakdown.length, 2);
      expect(model.monthlyBreakdown.first.month, '2026-06');
      expect(model.isEmpty, false);
    });

    test('缺字段时安全回退默认值', () {
      final model = InsightsModel.fromJson(const {'stats': {}});
      expect(model.totalEvents, 0);
      expect(model.monthlyBreakdown, isEmpty);
      expect(model.isEmpty, true);
    });
  });

  group('InsightsProvider', () {
    late MockInsightsRepository repository;
    late InsightsProvider provider;

    setUp(() {
      repository = MockInsightsRepository();
      provider = InsightsProvider(repository);
    });

    tearDown(() {
      provider.dispose();
    });

    test('load 成功后填充 insights', () async {
      when(() => repository.getInsights(days: any(named: 'days'))).thenAnswer((_) async {
        return InsightsModel.fromJson(const {
          'stats': {'totalEvents': 10},
          'summary': 'you have 10 events',
        });
      });

      await provider.load();

      expect(provider.error, isNull);
      expect(provider.insights, isNotNull);
      expect(provider.insights!.totalEvents, 10);
      expect(provider.loading, false);
    });

    test('load 失败时记录 error 且保留数据为空', () async {
      when(() => repository.getInsights(days: any(named: 'days')))
          .thenThrow(Exception('network error'));

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.insights, isNull);
    });

    test('clear 重置状态', () async {
      when(() => repository.getInsights(days: any(named: 'days'))).thenAnswer((_) async {
        return InsightsModel.fromJson(const {
          'stats': {'totalEvents': 10},
          'summary': 's',
        });
      });
      await provider.load();
      expect(provider.insights, isNotNull);

      provider.clear();
      expect(provider.insights, isNull);
      expect(provider.error, isNull);
    });
  });
}
