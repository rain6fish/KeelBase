// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/search/data/models/search_result.dart';
import 'package:front_app/features/search/presentation/providers/search_provider.dart';
import 'package:front_app/features/ai/data/models/conversation_summary.dart';
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

  group('PL-4.1 搜索历史', () {
    test('搜索后加入历史并去重', () async {
      when(() => repository.search(any())).thenAnswer((_) async => const SearchResult());
      await provider.search('a');
      await provider.search('b');
      await provider.search('a');

      expect(provider.history, ['a', 'b']);
    });

    test('历史超过上限时裁剪', () async {
      when(() => repository.search(any())).thenAnswer((_) async => const SearchResult());
      for (var i = 0; i < 15; i++) {
        await provider.search('q$i');
      }
      expect(provider.history.length, SearchProvider.maxHistory);
      expect(provider.history.first, 'q14');
    });

    test('clearHistory 清空', () async {
      when(() => repository.search(any())).thenAnswer((_) async => const SearchResult());
      await provider.search('a');
      await provider.clearHistory();
      expect(provider.history, isEmpty);
    });
  });

  group('PL-4.1 AI 对话过滤', () {
    late MockAiConversationRepository conversationRepo;

    setUp(() {
      conversationRepo = MockAiConversationRepository();
    });

    test('未提供 conversation repository 时对话为空', () async {
      await provider.loadConversations();
      expect(provider.conversations, isEmpty);
    });

    test('filteredConversations 按标题/内容关键词过滤', () async {
      when(() => conversationRepo.getConversations()).thenAnswer((_) async => [
        ConversationSummary(
          id: '1',
          messages: [ConversationMessagePreview(role: 'user', content: 'How to add event')],
        ),
        ConversationSummary(
          id: '2',
          messages: [ConversationMessagePreview(role: 'user', content: 'Weather today')],
        ),
      ]);
      final p = SearchProvider(repository, conversationRepository: conversationRepo);
      await p.loadConversations();
      await p.search('event');
      when(() => repository.search(any())).thenAnswer((_) async => const SearchResult());

      expect(p.filteredConversations.length, 1);
      expect(p.filteredConversations.first.id, '1');
    });
  });
}
