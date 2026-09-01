// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/ai/data/models/ai_trace_models.dart';
import 'package:front_app/features/ai/presentation/pages/ai_trace_page.dart';
import 'package:front_app/features/ai/presentation/providers/conversation_provider.dart';
import '../helpers.dart';

void main() {
  late MockAiConversationRepository repo;
  late ConversationProvider provider;

  setUp(() {
    repo = MockAiConversationRepository();
    provider = ConversationProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  AiTrace trace() => const AiTrace(id: 'c1', steps: [
        AiTraceStep(id: 's1', type: 'input', time: '2026-08-22T01:00:00Z', content: '帮我创建一个事件'),
        AiTraceStep(id: 's2', type: 'assistant', time: '2026-08-22T01:00:01Z', content: '好的，已为你创建。'),
        AiTraceStep(
          id: 's3',
          type: 'tool_call',
          time: '2026-08-22T01:00:02Z',
          toolName: 'create_event',
          args: '{"title":"晨会"}',
          success: true,
        ),
        AiTraceStep(
          id: 's4',
          type: 'confirmation',
          time: '2026-08-22T01:00:03Z',
          toolName: 'create_event',
          outcome: 'approve',
          trusted: true,
        ),
        AiTraceStep(
          id: 's5',
          type: 'effect',
          time: '2026-08-22T01:00:04Z',
          toolName: 'create_event',
          effect: AiTraceEffect(effectId: 9, resultType: 'event', resultId: 5, targetTitle: '晨会', revocable: true),
        ),
      ]);

  Widget wrap() => wrapPushableCupertinoPage(
        const AiTracePage(id: 'c1'),
        providers: [
          ChangeNotifierProvider<ConversationProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染轨迹步骤（输入/AI/工具/确认/副作用）', (tester) async {
    when(() => repo.getTrace('c1')).thenAnswer((_) async => trace());

    await pumpPage(tester);

    expect(find.text('执行轨迹'), findsOneWidget);
    expect(find.text('你的提问'), findsOneWidget);
    expect(find.text('AI 回复'), findsOneWidget);
    expect(find.text('工具调用'), findsOneWidget);
    expect(find.text('确认决策'), findsOneWidget);
    expect(find.text('创建记录'), findsOneWidget);
    expect(find.text('帮我创建一个事件'), findsOneWidget);
    expect(find.text('好的，已为你创建。'), findsOneWidget);
    expect(find.text('成功'), findsOneWidget);
    expect(find.text('已批准 · 本会话免确认'), findsOneWidget);
    expect(find.text('创建事件 → event #5'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget);
    expect(find.text('撤销'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('无步骤时显示空态', (tester) async {
    when(() => repo.getTrace('c1')).thenAnswer((_) async => const AiTrace(id: 'c1'));

    await pumpPage(tester);

    expect(find.text('该对话暂无执行轨迹'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败显示错误视图', (tester) async {
    when(() => repo.getTrace('c1')).thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('网络错误'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('撤销副作用成功提示', (tester) async {
    when(() => repo.getTrace('c1')).thenAnswer((_) async => trace());
    when(() => repo.revokeEffect(9)).thenAnswer((_) async {});

    await pumpPage(tester);
    await tester.tap(find.text('撤销'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.revokeEffect(9)).called(1);
    expect(find.text('已撤销，可经回收站恢复'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
