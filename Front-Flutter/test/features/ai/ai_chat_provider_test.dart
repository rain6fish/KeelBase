// SPDX-License-Identifier: Apache-2.0

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/ai/presentation/providers/ai_chat_provider.dart';
import 'package:front_app/features/ai/data/models/tool_step_model.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient api;
  late MockSseClient sse;
  late AiChatProvider provider;

  void mockStream() {
    when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
        .thenAnswer((_) => Stream.fromIterable([
              {'type': 'text', 'data': {'type': 'text', 'content': '你好'}},
              {'type': 'done', 'data': {'conversationId': 'conv-1'}},
            ]));
  }

  setUp(() {
    api = MockApiClient();
    sse = MockSseClient();
    provider = AiChatProvider(api, sse);
  });

  tearDown(() {
    provider.dispose();
  });

  group('默认状态', () {
    test('provider 默认为 deepseek', () {
      expect(provider.provider, 'deepseek');
      expect(provider.providerLabel, 'DeepSeek');
    });
  });

  group('sendMessage', () {
    void mockNonStreaming(String reply) {
      when(() => api.post('/ai/chat', data: any(named: 'data')))
          .thenAnswer((_) async => {
                'code': 200,
                'message': 'ok',
                'timestamp': '2026-08-07T00:00:00Z',
                'data': {
                  'conversationId': 'conv-delegate',
                  'reply': reply,
                  'provider': 'deepseek',
                  'model': 'deepseek-v4-flash',
                },
              });
    }

    test('请求 body 携带默认 provider', () async {
      mockStream();

      await provider.sendMessage('你好');

      final captured = verify(
        () => sse.postStream('/ai/chat/stream', body: captureAny(named: 'body')),
      ).captured;
      expect((captured.first as Map)['provider'], 'deepseek');
      expect((captured.first as Map)['message'], '你好');
    });

    test('委托触发词 → 走非流式 /ai/chat（不调 SSE）', () async {
      mockNonStreaming('本周安排建议：周一上午产品评审…');

      await provider.sendMessage('帮我安排本周');

      verify(() => api.post('/ai/chat', data: any(named: 'data'))).called(1);
      verifyNever(() => sse.postStream(any(), body: any(named: 'body')));
      // 完整回复显示 + conversationId 同步
      expect(provider.messages.last.content, '本周安排建议：周一上午产品评审…');
      expect(provider.messages.last.isStreaming, isFalse);
      expect(provider.currentConversationId, 'conv-delegate');
    });

    test('复杂措辞（综合分析）→ 非流式委托', () async {
      mockNonStreaming('综合分析结果');

      await provider.sendMessage('综合分析我的日程和统计');

      verify(() => api.post('/ai/chat', data: any(named: 'data'))).called(1);
    });

    test('动作词含技能词 → 排除委托，走流式', () async {
      mockStream();

      await provider.sendMessage('创建本周计划');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body'))).called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
    });

    test('导航词 → 排除委托，走流式', () async {
      mockStream();

      await provider.sendMessage('打开本周安排页');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body'))).called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
    });

    test('普通查询 → 走流式', () async {
      mockStream();

      await provider.sendMessage('本月有哪些事件');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body'))).called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
    });

    test('切换 qwen 后请求 body 携带新 provider', () async {
      provider.switchModel('qwen');
      mockStream();

      await provider.sendMessage('你好');

      final captured = verify(
        () => sse.postStream('/ai/chat/stream', body: captureAny(named: 'body')),
      ).captured;
      expect((captured.first as Map)['provider'], 'qwen');
    });

    test('done 事件携带的 conversationId 被保存（回归）', () async {
      mockStream();

      await provider.sendMessage('你好');

      expect(provider.currentConversationId, 'conv-1');
    });

    test('confirmation_request 设置待确认状态，确认后调用后端', () async {
      final gate = Completer<void>();
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) async* {
        yield {
          'type': 'confirmation_request',
          'data': {
            'type': 'confirmation_request',
            'confirmation': {
              'token': 'tok-1',
              'toolName': 'create_event',
              'summary': '创建事件：评审（明天 9:00）',
              'arguments': {'title': '评审'},
            },
          },
        };
        await gate.future; // 模拟服务端等待确认
      });

      final sendFuture = provider.sendMessage('帮我创建事件');
      await pumpEventQueue();

      expect(provider.currentConfirmation, isNotNull);
      expect(provider.currentConfirmation!.token, 'tok-1');
      expect(provider.currentConfirmation!.summary, contains('创建事件'));
      expect(provider.messages.last.pendingConfirmation, isNotNull);

      when(() => api.post('/ai/confirmations/tok-1', data: {'decision': 'approve'}))
          .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'timestamp': '', 'data': null});
      await provider.confirmPending(approved: true);

      verify(() => api.post('/ai/confirmations/tok-1', data: {'decision': 'approve'})).called(1);

      gate.complete();
      await sendFuture;
    });

    test('拒绝时调用后端 reject 决策', () async {
      final gate = Completer<void>();
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) async* {
        yield {
          'type': 'confirmation_request',
          'data': {
            'type': 'confirmation_request',
            'confirmation': {
              'token': 'tok-2',
              'toolName': 'create_todo',
              'summary': '创建待办：买牛奶',
              'arguments': {'title': '买牛奶'},
            },
          },
        };
        await gate.future;
      });

      final sendFuture = provider.sendMessage('帮我创建待办');
      await pumpEventQueue();

      when(() => api.post('/ai/confirmations/tok-2', data: {'decision': 'reject'}))
          .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'timestamp': '', 'data': null});
      await provider.confirmPending(approved: false);

      verify(() => api.post('/ai/confirmations/tok-2', data: {'decision': 'reject'})).called(1);

      gate.complete();
      await sendFuture;
    });

    test('工具步骤卡：text → tool_start → tool_end → text 交错渲染', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'text', 'data': {'type': 'text', 'content': '让我查一下'}},
                {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'query_events', 'summary': '查询事件'}}},
                {'type': 'tool_end', 'data': {'type': 'tool_end', 'toolEnd': {'name': 'query_events', 'success': true, 'summary': '查询到 2 个结果'}}},
                {'type': 'text', 'data': {'type': 'text', 'content': '找到了 2 个'}},
                {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-1'}},
              ]));

      await provider.sendMessage('查一下');

      // user + 步骤卡 + 汇总文本
      expect(provider.messages.length, 3);
      expect(provider.messages[1].toolStep, isNotNull);
      expect(provider.messages[1].toolStep!.status, ToolStepStatus.success);
      expect(provider.messages[1].toolStep!.summary, '查询到 2 个结果');
      expect(provider.messages[2].content, '让我查一下找到了 2 个');
      expect(provider.currentConversationId, 'conv-1');
    });

    test('工具步骤卡：running 状态在 tool_end 前保持', () async {
      final gate = Completer<void>();
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) async* {
        yield {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'query_events', 'summary': '查询事件'}}};
        await gate.future;
        yield {'type': 'tool_end', 'data': {'type': 'tool_end', 'toolEnd': {'name': 'query_events', 'success': true, 'summary': '查询到 1 个结果'}}};
        yield {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-1'}};
      });

      final sendFuture = provider.sendMessage('查一下');
      await pumpEventQueue();

      expect(provider.messages[1].toolStep!.status, ToolStepStatus.running);

      gate.complete();
      await sendFuture;
      expect(provider.messages[1].toolStep!.status, ToolStepStatus.success);
    });

    test('工具步骤卡：同名双工具各自成对解析', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'query_events', 'summary': '查询事件'}}},
                {'type': 'tool_end', 'data': {'type': 'tool_end', 'toolEnd': {'name': 'query_events', 'success': true, 'summary': '查询到 1 个结果'}}},
                {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'query_events', 'summary': '查询事件'}}},
                {'type': 'tool_end', 'data': {'type': 'tool_end', 'toolEnd': {'name': 'query_events', 'success': false, 'summary': '执行失败'}}},
                {'type': 'text', 'data': {'type': 'text', 'content': '完了'}},
                {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-1'}},
              ]));

      await provider.sendMessage('查两次');

      // user + step1(success) + step2(error) + 汇总文本
      expect(provider.messages.length, 4);
      expect(provider.messages[1].toolStep!.status, ToolStepStatus.success);
      expect(provider.messages[2].toolStep!.status, ToolStepStatus.error);
    });

    test('写操作 decline：确认卡清除 + 步骤卡 error', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'create_event', 'summary': '创建事件：评审'}}},
                {'type': 'confirmation_request', 'data': {'type': 'confirmation_request', 'confirmation': {'token': 'tok-1', 'toolName': 'create_event', 'summary': '创建事件：评审', 'arguments': {}}}},
                {'type': 'confirmation_decision', 'data': {'type': 'confirmation_decision', 'confirmationDecision': {'toolName': 'create_event', 'approved': false}}},
                {'type': 'tool_end', 'data': {'type': 'tool_end', 'toolEnd': {'name': 'create_event', 'success': false, 'summary': '操作已取消'}}},
                {'type': 'text', 'data': {'type': 'text', 'content': '好的，不创建了'}},
                {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-1'}},
              ]));
      when(() => api.post(any(), data: any(named: 'data')))
          .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'timestamp': '', 'data': null});

      await provider.sendMessage('帮我创建事件');

      // confirmation_decision 已清除确认卡：最后消息无 pendingConfirmation，步骤卡 error
      expect(provider.currentConfirmation, isNull);
      expect(provider.messages[1].toolStep!.status, ToolStepStatus.error);
      expect(provider.messages[1].toolStep!.summary, '操作已取消');
      expect(provider.messages.last.pendingConfirmation, isNull);
    });

    test('流 error 时 running 步骤卡解析为 error', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'tool_start', 'data': {'type': 'tool_start', 'toolStart': {'name': 'query_events', 'summary': '查询事件'}}},
                {'type': 'error', 'data': {'type': 'error', 'error': 'boom'}},
              ]));

      await provider.sendMessage('查一下');

      expect(provider.messages[1].toolStep!.status, ToolStepStatus.error);
    });
  });

  group('switchModel', () {
    test('切换后 provider 与展示名更新', () {
      provider.switchModel('qwen');

      expect(provider.provider, 'qwen');
      expect(provider.providerLabel, '通义千问');
    });

    test('切回 deepseek', () {
      provider.switchModel('qwen');
      provider.switchModel('deepseek');

      expect(provider.provider, 'deepseek');
      expect(provider.providerLabel, 'DeepSeek');
    });

    test('相同 provider 不触发通知', () {
      var notified = 0;
      provider.addListener(() => notified++);

      provider.switchModel('deepseek');

      expect(notified, 0);
    });
  });

  group('loadConversation', () {
    test('加载会话后同步会话的 provider', () async {
      when(() => api.get('/ai/conversations/conv-1')).thenAnswer((_) async => {
            'code': 200,
            'message': 'ok',
            'timestamp': '2026-08-05T00:00:00Z',
            'data': {
              'id': 'conv-1',
              'provider': 'qwen',
              'model': 'qwen-max',
              'messages': [
                {'role': 'user', 'content': '你好', 'timestamp': '2026-08-05T00:00:00Z'},
              ],
            },
          });

      await provider.loadConversation('conv-1');

      expect(provider.provider, 'qwen');
      expect(provider.messages.length, 1);
      expect(provider.messages[0].content, '你好');
    });
  });
}
