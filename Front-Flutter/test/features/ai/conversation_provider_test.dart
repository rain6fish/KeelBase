// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/ai/data/models/conversation_summary.dart';
import 'package:front_app/features/ai/presentation/providers/conversation_provider.dart';
import '../../helpers.dart';

void main() {
  late MockAiConversationRepository repository;
  late ConversationProvider provider;

  setUp(() {
    repository = MockAiConversationRepository();
    provider = ConversationProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  group('load', () {
    test('成功 → 填充对话列表', () async {
      when(() => repository.getConversations()).thenAnswer((_) async => [
            ConversationSummary(
              id: 'c1',
              messages: [ConversationMessagePreview(role: 'user', content: '你好')],
            ),
          ]);

      await provider.load();

      expect(provider.conversations.length, 1);
      expect(provider.conversations[0].titlePreview, '你好');
      expect(provider.loading, isFalse);
      expect(provider.error, isNull);
    });

    test('失败 → error 设置', () async {
      when(() => repository.getConversations()).thenThrow(Exception('network error'));

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.loading, isFalse);
    });
  });

  group('delete', () {
    test('删除 → 列表移除', () async {
      when(() => repository.getConversations()).thenAnswer((_) async => [
            ConversationSummary(id: 'c1', messages: const []),
            ConversationSummary(id: 'c2', messages: const []),
          ]);
      await provider.load();

      when(() => repository.deleteConversation('c1')).thenAnswer((_) async {});

      await provider.delete('c1');

      expect(provider.conversations.length, 1);
      expect(provider.conversations[0].id, 'c2');
    });
  });

  group('titlePreview', () {
    test('无 user 消息 → null（兜底文案由 UI 给）', () {
      const c = ConversationSummary(id: 'c1', messages: []);
      expect(c.titlePreview, isNull);
    });

    test('超长标题截断', () {
      final long = List.filled(50, '字').join(); // 50 字符
      final c = ConversationSummary(
        id: 'c1',
        messages: [ConversationMessagePreview(role: 'user', content: long)],
      );
      // 30 字符 + 省略号
      final title = c.titlePreview!;
      expect(title.length, 33);
      expect(title.endsWith('...'), isTrue);
    });
  });
}
