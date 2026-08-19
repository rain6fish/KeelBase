import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/ai/data/models/conversation_summary.dart';
import 'package:front_app/features/ai/presentation/pages/ai_conversation_history_page.dart';
import 'package:front_app/features/ai/presentation/providers/ai_chat_provider.dart';
import 'package:front_app/features/ai/presentation/providers/conversation_provider.dart';
import '../helpers.dart';

void main() {
  late MockAiConversationRepository repo;
  late MockApiClient apiClient;
  late MockSseClient sseClient;
  late ConversationProvider conversationProvider;
  late AiChatProvider aiChatProvider;
  late GoRouter router;

  final now = DateTime.now().toUtc().toIso8601String();

  ConversationSummary conv(String id, String title) => ConversationSummary(
        id: id,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        messages: [
          ConversationMessagePreview(role: 'user', content: title),
        ],
        createdAt: now,
        lastActivityAt: now,
      );

  setUp(() {
    repo = MockAiConversationRepository();
    apiClient = MockApiClient();
    sseClient = MockSseClient();
    conversationProvider = ConversationProvider(repo);
    aiChatProvider = AiChatProvider(apiClient, sseClient);
  });

  tearDown(() {
    conversationProvider.dispose();
    aiChatProvider.dispose();
  });

  Widget wrap() {
    router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(path: '/home', builder: (_, __) => const SizedBox.shrink()),
        GoRoute(
          path: '/ai/history',
          builder: (_, __) => const AiConversationHistoryPage(),
        ),
        GoRoute(
          path: '/ai/trace/:id',
          builder: (_, __) => const Text('TRACE_PAGE'),
        ),
      ],
    );
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<ConversationProvider>.value(
          value: conversationProvider,
        ),
        ChangeNotifierProvider<AiChatProvider>.value(value: aiChatProvider),
      ],
      child: CupertinoApp.router(
        routerConfig: router,
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
      ),
    );
  }

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pumpAndSettle();
    router.push('/ai/history');
    await tester.pumpAndSettle();
  }

  testWidgets('空列表显示空态文案', (tester) async {
    when(() => repo.getConversations()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('对话历史'), findsOneWidget);
    expect(find.text('暂无历史对话'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载中显示 loading 文案', (tester) async {
    final gate = Completer<List<ConversationSummary>>();
    when(() => repo.getConversations()).thenAnswer((_) => gate.future);

    await pumpPage(tester);

    expect(find.text('加载中...'), findsOneWidget);
    gate.complete([]);
  });

  testWidgets('加载失败显示错误视图', (tester) async {
    when(() => repo.getConversations()).thenThrow(Exception('加载失败'));

    await pumpPage(tester);

    expect(find.textContaining('加载失败'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('渲染对话列表（标题 + 时间）', (tester) async {
    when(() => repo.getConversations())
        .thenAnswer((_) async => [conv('c1', '帮我查下事件'), conv('c2', '写个周报')]);

    await pumpPage(tester);

    expect(find.text('对话历史'), findsOneWidget);
    expect(find.text('帮我查下事件'), findsOneWidget);
    expect(find.text('写个周报'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点 trash 确认删除 → 调用 deleteConversation', (tester) async {
    when(() => repo.getConversations())
        .thenAnswer((_) async => [conv('c1', '帮我查下事件'), conv('c2', '写个周报')]);
    when(() => repo.deleteConversation('c1')).thenAnswer((_) async {});

    await pumpPage(tester);

    await tester.tap(find.byIcon(CupertinoIcons.trash).first);
    await tester.pumpAndSettle();

    expect(find.text('确定删除「帮我查下事件」？'), findsOneWidget);

    await tester.tap(find.text('删除').last);
    await tester.pumpAndSettle();

    verify(() => repo.deleteConversation('c1')).called(1);
    expect(find.text('帮我查下事件'), findsNothing);
  });

  testWidgets('点对话行加载会话并返回', (tester) async {
    when(() => repo.getConversations())
        .thenAnswer((_) async => [conv('c1', '帮我查下事件')]);
    when(() => apiClient.get('/ai/conversations/c1')).thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'timestamp': '',
          'data': {
            'messages': [
              {'role': 'user', 'content': 'hi'},
            ],
            'provider': 'deepseek',
          },
        });

    await pumpPage(tester);

    await tester.tap(find.text('帮我查下事件'));
    await tester.pumpAndSettle();

    verify(() => apiClient.get('/ai/conversations/c1')).called(1);
    expect(aiChatProvider.error, isNull);
  });

  testWidgets('点 trace 按钮跳转轨迹页', (tester) async {
    when(() => repo.getConversations())
        .thenAnswer((_) async => [conv('c1', '帮我查下事件')]);

    await pumpPage(tester);

    await tester.tap(find.byIcon(CupertinoIcons.clock).first);
    await tester.pumpAndSettle();

    expect(find.text('TRACE_PAGE'), findsOneWidget);
  });
}
