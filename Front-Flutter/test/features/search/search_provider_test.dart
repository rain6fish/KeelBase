import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/search/data/models/search_result.dart';
import 'package:front_app/features/search/presentation/providers/search_provider.dart';
import '../../helpers.dart';

void main() {
  late MockSearchRepository repository;
  late SearchProvider provider;

  setUp(() {
    repository = MockSearchRepository();
    provider = SearchProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  group('search', () {
    test('成功 → 填充结果与 query', () async {
      when(() => repository.search('meet')).thenAnswer((_) async => const SearchResult());

      await provider.search('meet');

      expect(provider.loading, isFalse);
      expect(provider.query, 'meet');
      expect(provider.error, isNull);
    });

    test('失败 → error 设置，结果清空', () async {
      when(() => repository.search('meet')).thenThrow(Exception('network error'));

      await provider.search('meet');

      expect(provider.error, isNotNull);
      expect(provider.result.events, isEmpty);
    });

    test('空查询 → 直接清空，不调用 repository', () async {
      await provider.search('   ');

      expect(provider.query, '');
      verifyNever(() => repository.search(any()));
    });
  });

  group('clear', () {
    test('清空 query 与结果', () async {
      when(() => repository.search('meet')).thenAnswer((_) async => const SearchResult());
      await provider.search('meet');

      provider.clear();

      expect(provider.query, '');
      expect(provider.result.events, isEmpty);
      expect(provider.error, isNull);
    });
  });
}
