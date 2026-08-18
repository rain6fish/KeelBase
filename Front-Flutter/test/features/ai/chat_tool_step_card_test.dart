import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/ai/data/models/tool_step_model.dart';
import 'package:front_app/features/ai/presentation/widgets/chat_tool_step_card.dart';
import '../../helpers.dart';

void main() {
  Widget wrap(ToolStepModel step) => wrapCupertinoPage(ChatToolStepCard(step: step));

  testWidgets('读工具：显示「读」+「只读」徽标', (tester) async {
    await tester.pumpWidget(wrap(ToolStepModel(
      name: 'query_events',
      status: ToolStepStatus.success,
      summary: '查询事件',
    )));
    expect(find.text('读'), findsOneWidget);
    expect(find.text('只读'), findsOneWidget);
  });

  testWidgets('写工具执行中：显示「写」+「需你确认」', (tester) async {
    await tester.pumpWidget(wrap(ToolStepModel(
      name: 'create_event',
      status: ToolStepStatus.running,
      summary: '创建事件',
      isWrite: true,
    )));
    expect(find.text('写'), findsOneWidget);
    expect(find.text('需你确认'), findsOneWidget);
  });

  testWidgets('写工具成功：显示「写」+「已确认 · 可撤销」', (tester) async {
    await tester.pumpWidget(wrap(ToolStepModel(
      name: 'create_event',
      status: ToolStepStatus.success,
      summary: '创建事件：会议（9:00 至 10:00）',
      isWrite: true,
    )));
    expect(find.text('写'), findsOneWidget);
    expect(find.text('已确认 · 可撤销'), findsOneWidget);
  });
}
