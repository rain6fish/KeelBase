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
      expect(provider.provider, 'deepseek');
    });
  });

  group('sendMessage', () {
    test('请求 body 携带默认 provider', () async {
      mockStream();

      await provider.sendMessage('你好');

      final captured = verify(
        () => sse.postStream('/ai/chat/stream', body: captureAny(named: 'body')),
      ).captured;
      expect((captured.first as Map)['provider'], 'deepseek');
      expect((captured.first as Map)['message'], '你好');
    });

    test('委托触发词也走流式（2026-10-02 起）：客户端不再对消息分流', () async {
      mockStream();

      await provider.sendMessage('帮我安排本周');

      // 此前这里断言的是「走非流式 /ai/chat 且不调 SSE」—— 那时流式端点不分类意图，
      // 客户端得自己揣一份后端触发词去猜（猜漏一个词就静默失去委托能力）。
      // 技能短路收进流式端点后，客户端不必知道任何触发词：两条端点都委托。
      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body'))).called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
    });

    test('动作词 / 导航词的消息同样走流式（确认卡与导航本就是流式的活）', () async {
      mockStream();

      await provider.sendMessage('创建本周计划');
      await provider.sendMessage('打开本周安排页');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body'))).called(2);
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
      expect(provider.currentConfirmation!.summary!.fallback, contains('创建事件'));
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

      when(() => api.post('/ai/confirmations/tok-2', data: {'decision': 'decline'}))
          .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'timestamp': '', 'data': null});
      await provider.confirmPending(approved: false);

      verify(() => api.post('/ai/confirmations/tok-2', data: {'decision': 'decline'})).called(1);

      gate.complete();
      await sendFuture;
    });

    test('run 模式：解析 mode=run + runItems + runRisk（一次授权整批）', () async {
      final gate = Completer<void>();
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) async* {
        yield {
          'type': 'confirmation_request',
          'data': {
            'type': 'confirmation_request',
            'confirmation': {
              'token': 'run-1',
              'toolName': 'run',
              'summary': '',
              'arguments': <String, dynamic>{},
              'mode': 'run',
              'run': {
                'runId': 'run-1',
                'riskLevel': 'R4',
                'items': [
                  {'toolName': 'create_event', 'summary': '创建事件：A', 'riskLevel': 'R3'},
                  {'toolName': 'create_todo', 'summary': '创建待办：B', 'riskLevel': 'R3'},
                ],
              },
            },
          },
        };
        await gate.future;
      });

      final sendFuture = provider.sendMessage('批量执行');
      await pumpEventQueue();

      final conf = provider.currentConfirmation!;
      expect(conf.isRun, isTrue);
      expect(conf.runItems, hasLength(2));
      expect(conf.runItems.first.summary!.fallback, '创建事件：A');
      expect(conf.runRisk, 'R4'); // spec §2.2/§2.5：批级最高风险随卡下发

      gate.complete();
      await sendFuture;
    });

    test('run 模式：runItems 缺失仍认定为 run 卡（不退化成误导性单动作卡）', () async {
      final gate = Completer<void>();
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) async* {
        yield {
          'type': 'confirmation_request',
          'data': {
            'type': 'confirmation_request',
            'confirmation': {
              'token': 'run-2',
              'toolName': 'run',
              'summary': '',
              'arguments': <String, dynamic>{},
              'mode': 'run',
              'run': {'runId': 'run-2', 'riskLevel': 'R3', 'items': <dynamic>[]},
            },
          },
        };
        await gate.future;
      });

      final sendFuture = provider.sendMessage('批量执行');
      await pumpEventQueue();

      final conf = provider.currentConfirmation!;
      expect(conf.isRun, isTrue); // 以 mode 为准
      expect(conf.runItems, isEmpty);
      expect(conf.runRisk, 'R3');

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
      expect(provider.messages[1].toolStep!.summary!.fallback, '查询到 2 个结果');
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
      expect(provider.messages[1].toolStep!.summary!.fallback, '操作已取消');
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
      expect(provider.provider, 'qwen');
    });

    test('切回 deepseek', () {
      provider.switchModel('qwen');
      provider.switchModel('deepseek');

      expect(provider.provider, 'deepseek');
      expect(provider.provider, 'deepseek');
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

  group('classifyStreamFailure（错误分类表）', () {
    StreamFailureAction classify({
      StreamFailureKind kind = StreamFailureKind.transport,
      bool hasContent = false,
      bool hasSideEffectEvents = false,
      int retryCount = 0,
      bool retryable = true,
    }) =>
        classifyStreamFailure(
          kind: kind,
          hasContent: hasContent,
          hasSideEffectEvents: hasSideEffectEvents,
          retryCount: retryCount,
          retryable: retryable,
        );

    test('传输层失败、尚无内容、首次 → 重试一次', () {
      expect(classify(), StreamFailureAction.retryStream);
    });

    test('传输层失败、重试过一次仍失败 → 回退非流式', () {
      expect(classify(retryCount: 1),
          StreamFailureAction.fallbackToNonStreaming);
    });

    test('5xx / 服务端流错误 → 回退非流式', () {
      expect(classify(kind: StreamFailureKind.serverUnavailable),
          StreamFailureAction.fallbackToNonStreaming);
    });

    test('鉴权/限流/4xx → 只报错（换通道也一样被拒）', () {
      expect(classify(kind: StreamFailureKind.authOrPolicy),
          StreamFailureAction.surfaceError);
    });

    test('已发生工具/确认事件 → 只报错（重放会重复副作用）', () {
      expect(classify(hasSideEffectEvents: true),
          StreamFailureAction.surfaceError);
    });

    test('超时不算明确传输信号 → 不重试、直接回退', () {
      expect(classify(retryable: false),
          StreamFailureAction.fallbackToNonStreaming);
    });

    test('已有文本内容（无副作用）→ 回退', () {
      expect(classify(hasContent: true),
          StreamFailureAction.fallbackToNonStreaming);
    });
  });

  group('流式失败 → 重试 / 回退 / 报错（SSE）', () {
    Map<String, dynamic> fallbackEnvelope([String reply = '普通模式回复']) => {
          'code': 200,
          'message': 'ok',
          'timestamp': '',
          'data': {'conversationId': 'conv-fb', 'reply': reply},
        };

    test('正常流式：不回退、不提示', () async {
      mockStream();

      await provider.sendMessage('你好');

      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, '你好');
    });

    test('服务端流 error（尚无内容）→ 回退非流式并拿到回复', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'error', 'data': {'type': 'error', 'error': 'boom'}},
              ]));
      when(() => api.post('/ai/chat', data: any(named: 'data')))
          .thenAnswer((_) async => fallbackEnvelope());

      await provider.sendMessage('你好');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .called(1); // 服务端错误不再重试流式
      verify(() => api.post('/ai/chat', data: any(named: 'data'))).called(1);
      expect(provider.fellBackToNonStreaming, isTrue);
      expect(provider.messages.last.content, '普通模式回复');
      expect(provider.currentConversationId, 'conv-fb');
    });

    test('HTTP 500 → 回退非流式', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'error', 'data': {'type': 'error', 'error': 'HTTP 500'}},
              ]));
      when(() => api.post('/ai/chat', data: any(named: 'data')))
          .thenAnswer((_) async => fallbackEnvelope());

      await provider.sendMessage('你好');

      verify(() => api.post('/ai/chat', data: any(named: 'data'))).called(1);
      expect(provider.messages.last.content, '普通模式回复');
    });

    test('HTTP 401 → 不重试、不回退，如实报错', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'error', 'data': {'type': 'error', 'error': 'HTTP 401'}},
              ]));

      await provider.sendMessage('你好');

      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, contains('HTTP 401'));
    });

    test('传输失败首次 → 重试流式一次并成功（不回退）', () async {
      var calls = 0;
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) {
        calls++;
        if (calls == 1) {
          return Stream.fromIterable([
            {
                  'type': 'error',
                  'data': {'type': 'error', 'error': 'SocketException: reset', 'source': 'transport'},
                },
          ]);
        }
        return Stream.fromIterable([
          {'type': 'text', 'data': {'type': 'text', 'content': '重试成功'}},
          {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-r'}},
        ]);
      });

      await provider.sendMessage('你好');

      expect(calls, 2);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, '重试成功');
    });

    test('传输失败两次 → 回退非流式', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {
                  'type': 'error',
                  'data': {'type': 'error', 'error': 'SocketException: reset', 'source': 'transport'},
                },
              ]));
      when(() => api.post('/ai/chat', data: any(named: 'data')))
          .thenAnswer((_) async => fallbackEnvelope('退避后回复'));

      await provider.sendMessage('你好');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .called(2);
      expect(provider.messages.last.content, '退避后回复');
      expect(provider.fellBackToNonStreaming, isTrue);
    });

    test('已发生工具事件后流错 → 不重试、不回退，只报错', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {
                  'type': 'tool_start',
                  'data': {
                    'type': 'tool_start',
                    'toolStart': {'name': 'query_events', 'summary': '查询事件'},
                  },
                },
                {
                  'type': 'error',
                  'data': {'type': 'error', 'error': 'SocketException: reset', 'source': 'transport'},
                },
              ]));

      await provider.sendMessage('查一下');

      verify(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, contains('SocketException'));
    });

    test('回退请求也失败 → 报原始流式错误', () async {
      when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
          .thenAnswer((_) => Stream.fromIterable([
                {'type': 'error', 'data': {'type': 'error', 'error': 'HTTP 503'}},
              ]));
      when(() => api.post('/ai/chat', data: any(named: 'data')))
          .thenThrow(Exception('fallback down'));

      await provider.sendMessage('你好');

      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, contains('HTTP 503'));
    });
  });

  group('流式失败 → 回退 / 重试（WS）', () {
    late MockWsClient ws;

    setUp(() {
      ws = MockWsClient();
      provider.dispose();
      provider = AiChatProvider(api, sse, wsClient: ws);
    });

    test('WS 正常流：不回退、不走 SSE', () async {
      when(() => ws.events).thenAnswer((_) => Stream.fromIterable([
            {'event': 'ai:text', 'data': {'type': 'text', 'content': 'WS 回复'}},
            {'event': 'ai:done', 'data': {'type': 'done', 'conversationId': 'conv-ws'}},
          ]));

      await provider.sendMessage('你好');

      verifyNever(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')));
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, 'WS 回复');
      expect(provider.currentConversationId, 'conv-ws');
    });

    test('WS 断线（ws:reconnecting）→ 重试一次仍断 → 回退非流式', () async {
      when(() => ws.events).thenAnswer((_) => Stream.fromIterable([
            {'event': 'ws:reconnecting', 'data': {'retryMs': 1000}},
          ]));
      when(() => api.post('/ai/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => {
          'code': 200,
          'message': 'ok',
          'timestamp': '',
          'data': {'conversationId': 'conv-fb', 'reply': 'WS 断线后普通模式回复'},
        },
      );

      await provider.sendMessage('你好');

      verify(() => ws.connect()).called(2); // 首次 + 重试一次
      verify(() => api.post('/ai/chat', data: any(named: 'data'))).called(1);
      expect(provider.fellBackToNonStreaming, isTrue);
      expect(provider.messages.last.content, 'WS 断线后普通模式回复');
    });

    test('WS 前门 AI_RATE_LIMITED → 不重试、不回退', () async {
      when(() => ws.events).thenAnswer((_) => Stream.fromIterable([
            {
              'event': 'error',
              'data': {'code': 'AI_RATE_LIMITED', 'message': 'ai:chat rate limit exceeded'},
            },
          ]));

      await provider.sendMessage('你好');

      verify(() => ws.connect()).called(1);
      verifyNever(() => api.post('/ai/chat', data: any(named: 'data')));
      expect(provider.fellBackToNonStreaming, isFalse);
      expect(provider.messages.last.content, contains('rate limit'));
    });
  });
}
