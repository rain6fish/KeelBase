// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/ai/data/models/conversation_summary.dart';

void main() {
  group('ConversationSummary', () {
    test('fromJson 全字段', () {
      final s = ConversationSummary.fromJson({
        'id': 'conv-1',
        'provider': 'deepseek',
        'model': 'deepseek-chat',
        'messages': [
          {'role': 'user', 'content': '帮我创建一个会议', 'timestamp': '2026-08-01T10:00:00Z'},
          {'role': 'assistant', 'content': '好的', 'timestamp': '2026-08-01T10:00:01Z'},
        ],
        'createdAt': '2026-08-01T10:00:00Z',
        'lastActivityAt': '2026-08-01T10:00:01Z',
      });
      expect(s.id, 'conv-1');
      expect(s.provider, 'deepseek');
      expect(s.messages, hasLength(2));
      expect(s.messages.first.role, 'user');
      expect(s.createdAt, '2026-08-01T10:00:00Z');
      expect(s.lastActivityAt, '2026-08-01T10:00:01Z');
    });

    test('previewTitle 取首条 user 消息并截断 30 字', () {
      final s = ConversationSummary.fromJson({
        'id': 'c',
        'messages': [
          {'role': 'assistant', 'content': '忽略我'},
          {'role': 'user', 'content': '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十'},
        ],
      });
      final title = s.previewTitle;
      expect(title.length, 33); // 30 + '...'
      expect(title.endsWith('...'), isTrue);
    });

    test('previewTitle 跳过空白首条', () {
      final s = ConversationSummary.fromJson({
        'id': 'c',
        'messages': [
          {'role': 'user', 'content': '   '},
          {'role': 'user', 'content': '有效标题'},
        ],
      });
      expect(s.previewTitle, '有效标题');
    });

    test('previewTitle 无 user 消息回退「新对话」', () {
      final s = ConversationSummary.fromJson({'id': 'c', 'messages': []});
      expect(s.previewTitle, '新对话');
    });

    test('fromJson 缺省字段回退', () {
      final s = ConversationSummary.fromJson({});
      expect(s.id, '');
      expect(s.provider, isNull);
      expect(s.messages, isEmpty);
      expect(s.createdAt, isNull);
    });
  });

  group('ConversationMessagePreview', () {
    test('fromJson 全字段', () {
      final m = ConversationMessagePreview.fromJson({
        'role': 'user',
        'content': 'hello',
        'timestamp': '2026-08-01T10:00:00Z',
      });
      expect(m.role, 'user');
      expect(m.content, 'hello');
      expect(m.timestamp, '2026-08-01T10:00:00Z');
    });

    test('缺省字段回退', () {
      final m = ConversationMessagePreview.fromJson({});
      expect(m.role, 'user');
      expect(m.content, '');
      expect(m.timestamp, isNull);
    });
  });
}
