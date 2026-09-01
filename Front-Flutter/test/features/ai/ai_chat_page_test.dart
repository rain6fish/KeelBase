// SPDX-License-Identifier: Apache-2.0

import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/ai/presentation/pages/ai_chat_page.dart';
import 'package:front_app/features/ai/presentation/providers/ai_chat_provider.dart';
import 'package:front_app/core/api/capabilities_provider.dart';
import 'package:front_app/core/api/capabilities_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient api;
  late MockSseClient sse;
  late AiChatProvider provider;

  setUp(() {
    api = MockApiClient();
    sse = MockSseClient();
    provider = AiChatProvider(api, sse);
  });

  tearDown(() {
    provider.dispose();
  });

  Future<void> pumpAiChatPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<CapabilitiesProvider>.value(
        value: CapabilitiesProvider(CapabilitiesRepository(api)),
        child: ChangeNotifierProvider<AiChatProvider>.value(
          value: provider,
          child: CupertinoApp(
            locale: const Locale('zh', 'CN'),
            supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const AiChatPage(),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('导航栏显示默认模型 DeepSeek', (tester) async {
    await pumpAiChatPage(tester);

    expect(find.text('DeepSeek'), findsOneWidget);
  });

  testWidgets('点击模型按钮弹出选择器并可切换', (tester) async {
    await pumpAiChatPage(tester);

    // 点模型按钮 → 弹出 ActionSheet
    await tester.tap(find.text('DeepSeek'));
    await tester.pumpAndSettle();

    expect(find.text('选择模型'), findsOneWidget);
    expect(find.text('通义千问'), findsOneWidget);

    // 选通义千问 → provider 更新，导航栏刷新
    await tester.tap(find.text('通义千问'));
    await tester.pumpAndSettle();

    expect(provider.provider, 'qwen');
    expect(find.text('通义千问'), findsOneWidget);
  });

  testWidgets('写操作触发确认卡，点确认调用后端', (tester) async {
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
    when(() => api.post('/ai/confirmations/tok-1', data: {'decision': 'approve'}))
        .thenAnswer((_) async => {'code': 200, 'message': 'ok', 'timestamp': '', 'data': null});

    await pumpAiChatPage(tester);
    unawaited(provider.sendMessage('帮我创建事件'));
    await tester.pumpAndSettle();

    // 确认卡渲染
    expect(find.text('确认操作'), findsOneWidget);
    expect(find.text('创建事件：评审（明天 9:00）'), findsOneWidget);

    // 点确认 → 调用后端
    await tester.tap(find.text('确认'));
    await tester.pumpAndSettle();
    verify(() => api.post('/ai/confirmations/tok-1', data: {'decision': 'approve'})).called(1);

    gate.complete();
  });

  testWidgets('工具步骤卡：running 时显示正在执行，tool_end 后已完成', (tester) async {
    final gate = Completer<void>();
    when(() => sse.postStream('/ai/chat/stream', body: any(named: 'body')))
        .thenAnswer((_) async* {
      yield {
        'type': 'tool_start',
        'data': {
          'type': 'tool_start',
          'toolStart': {'name': 'query_events', 'summary': '查询事件'},
        },
      };
      await gate.future; // 保持 running 状态
      yield {
        'type': 'tool_end',
        'data': {
          'type': 'tool_end',
          'toolEnd': {'name': 'query_events', 'success': true, 'summary': '查询到 3 个结果'},
        },
      };
      yield {'type': 'done', 'data': {'type': 'done', 'conversationId': 'conv-1'}};
    });

    await pumpAiChatPage(tester);
    unawaited(provider.sendMessage('查一下'));
    // running 阶段用 pump 而非 pumpAndSettle：CupertinoActivityIndicator 是无限动画，settle 永不完成
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // running 卡渲染
    expect(find.text('查询事件'), findsOneWidget);
    expect(find.text('正在执行…'), findsOneWidget);

    // 完成后转为已完成 + 结果摘要（动画停止后可 settle）
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('查询到 3 个结果'), findsOneWidget);
    expect(find.text('已完成'), findsOneWidget);
  });
}
