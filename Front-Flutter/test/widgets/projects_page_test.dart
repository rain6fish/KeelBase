// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/pm/data/models/project_model.dart';
import 'package:front_app/features/pm/data/repositories/pm_repository.dart';
import 'package:front_app/features/pm/presentation/pages/projects_page.dart';
import 'package:front_app/features/pm/presentation/providers/pm_provider.dart';
import '../helpers.dart';

class MockPmRepository extends Mock implements PmRepository {}

void main() {
  late MockPmRepository repo;
  late PmProvider provider;

  setUp(() {
    repo = MockPmRepository();
    provider = PmProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  Widget wrap() => wrapCupertinoPage(
        const ProjectsPage(),
        providers: [
          ChangeNotifierProvider<PmProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染项目列表', (tester) async {
    when(() => repo.getProjects()).thenAnswer((_) async => [
          const ProjectModel(id: 1, name: '迁移项目', status: 'active', riskLevel: 'high'),
          const ProjectModel(id: 2, name: '新平台', status: 'planned', riskLevel: 'low'),
        ]);

    await pumpPage(tester);

    expect(find.text('项目管理'), findsOneWidget);
    expect(find.text('迁移项目'), findsOneWidget);
    expect(find.text('新平台'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget); // active 状态
    expect(find.text('规划中'), findsOneWidget); // planned 状态
    expect(find.text('高'), findsOneWidget);
    expect(find.text('低'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getProjects()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.textContaining('暂无项目'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败时列表为空态', (tester) async {
    when(() => repo.getProjects()).thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('暂无项目'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('新增项目成功提示', (tester) async {
    when(() => repo.getProjects()).thenAnswer((_) async => []);
    when(() => repo.createProject(any())).thenAnswer((_) async =>
        const ProjectModel(id: 3, name: '新项目'));

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增项目'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField).first, '新项目');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.createProject(any())).called(1);
    expect(find.text('已保存'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
