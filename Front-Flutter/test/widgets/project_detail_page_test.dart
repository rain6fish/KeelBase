import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/pm/data/models/project_model.dart';
import 'package:front_app/features/pm/data/repositories/pm_repository.dart';
import 'package:front_app/features/pm/presentation/pages/project_detail_page.dart';
import 'package:front_app/features/pm/presentation/providers/pm_provider.dart';
import '../helpers.dart';

class MockPmRepository extends Mock implements PmRepository {}

void main() {
  late MockPmRepository repo;
  late MockApiClient apiClient;
  late PmProvider provider;

  setUp(() {
    repo = MockPmRepository();
    apiClient = MockApiClient();
    provider = PmProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  ProjectDetailModel fullDetail() => ProjectDetailModel(
        project: const ProjectModel(
          id: 1,
          name: '迁移项目',
          description: '数据库迁移到 PostgreSQL',
          status: 'active',
          riskLevel: 'high',
        ),
        milestones: [
          const MilestoneModel(id: 1, projectId: 1, title: '规划', status: 'done'),
        ],
        tasks: [
          const ProjectTaskModel(id: 1, projectId: 1, title: '导出数据', status: 'pending'),
        ],
        risks: [
          const ProjectRiskModel(id: 1, projectId: 1, level: 'high', reason: '外部依赖风险'),
        ],
        memberCount: 3,
      );

  Widget wrap() => wrapPushableCupertinoPage(
        const ProjectDetailPage(projectId: 1),
        providers: [
          ChangeNotifierProvider<PmProvider>.value(value: provider),
          Provider<ApiClient>.value(value: apiClient),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染项目详情（里程碑/任务/风险）', (tester) async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => fullDetail());

    await pumpPage(tester);

    expect(find.text('迁移项目'), findsWidgets);
    expect(find.text('里程碑'), findsOneWidget);
    expect(find.text('任务'), findsOneWidget);
    expect(find.text('风险'), findsOneWidget);
    expect(find.text('规划'), findsOneWidget);
    expect(find.text('导出数据'), findsOneWidget);
    expect(find.textContaining('外部依赖风险'), findsOneWidget);
    expect(find.textContaining('3 成员'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('无子资源时显示各空态文案', (tester) async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => ProjectDetailModel(
          project: const ProjectModel(id: 1, name: '迁移项目'),
        ));

    await pumpPage(tester);

    expect(find.text('暂无里程碑'), findsOneWidget);
    expect(find.text('暂无任务'), findsOneWidget);
    expect(find.text('暂无风险记录'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败显示错误信息', (tester) async {
    when(() => repo.getProjectDetail(1)).thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('网络错误'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击风险分析渲染结果与成功 toast', (tester) async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => fullDetail());
    when(() => apiClient.get('/pm/projects/1/analyze')).thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'data': {'level': 'medium', 'score': 50, 'reasons': ['里程碑延迟']},
          'timestamp': '2026-08-22T00:00:00Z',
        });

    await pumpPage(tester);
    await tester.tap(find.text('风险分析'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('风险等级'), findsOneWidget);
    expect(find.text('• 里程碑延迟'), findsOneWidget);
    expect(find.text('分析完成'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('新增任务后提示成功', (tester) async {
    when(() => repo.getProjectDetail(1)).thenAnswer((_) async => fullDetail());
    when(() => repo.createTask(
          projectId: any(named: 'projectId'),
          title: any(named: 'title'),
          dueDate: any(named: 'dueDate'),
        )).thenAnswer((_) async {});

    await pumpPage(tester);

    final addInTasks = find.descendant(
      of: find.widgetWithText(Row, '任务'),
      matching: find.byType(CupertinoButton),
    );
    await tester.ensureVisible(addInTasks);
    await tester.pump();
    await tester.tap(addInTasks);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增任务'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField), '执行迁移');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.createTask(
          projectId: 1,
          title: '执行迁移',
          dueDate: any(named: 'dueDate'),
        )).called(1);
    expect(find.text('已保存'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
