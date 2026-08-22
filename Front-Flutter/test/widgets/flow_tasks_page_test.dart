import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/flows/data/models/flow_task_model.dart';
import 'package:front_app/features/flows/presentation/pages/flow_tasks_page.dart';
import 'package:front_app/features/flows/presentation/providers/flows_provider.dart';
import '../helpers.dart';

void main() {
  late MockFlowsRepository repo;
  late FlowsProvider provider;

  setUp(() {
    repo = MockFlowsRepository();
    provider = FlowsProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  FlowTaskModel task({int id = 1, String? title}) => FlowTaskModel(
        id: id,
        instanceId: 1,
        nodeId: 'n1',
        title: title ?? '审批采购申请',
        flowName: '采购流程',
        createdAt: '2026-08-22',
      );

  Widget wrap() => wrapPushableCupertinoPage(
        const FlowTasksPage(),
        providers: [
          ChangeNotifierProvider<FlowsProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染审批待办列表', (tester) async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [
          task(),
          task(id: 2, title: '报销审批'),
        ]);

    await pumpPage(tester);

    expect(find.text('审批待办'), findsOneWidget);
    expect(find.text('审批采购申请'), findsOneWidget);
    expect(find.text('报销审批'), findsOneWidget);
    expect(find.text('通过'), findsNWidgets(2));
    expect(find.text('驳回'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('暂无审批任务'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('通过审批移除该待办', (tester) async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [
          task(),
          task(id: 2, title: '报销审批'),
        ]);
    when(() => repo.approve(1, 'approve', note: any(named: 'note')))
        .thenAnswer((_) async {});

    await pumpPage(tester);

    // 第一行的「通过」按钮
    await tester.tap(find.text('通过').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    // 确认弹层中最后的「通过」是确认按钮
    await tester.tap(find.text('通过').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.approve(1, 'approve', note: any(named: 'note'))).called(1);
    expect(find.text('审批采购申请'), findsNothing);
    expect(find.text('报销审批'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('驳回审批移除该待办', (tester) async {
    when(() => repo.getMyTasks()).thenAnswer((_) async => [
          task(),
          task(id: 2, title: '报销审批'),
        ]);
    when(() => repo.approve(1, 'reject', note: any(named: 'note')))
        .thenAnswer((_) async {});

    await pumpPage(tester);

    await tester.tap(find.text('驳回').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    await tester.tap(find.text('驳回').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.approve(1, 'reject', note: any(named: 'note'))).called(1);
    expect(find.text('审批采购申请'), findsNothing);
    expect(find.text('报销审批'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
