// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/approval/data/models/approval_models.dart';
import 'package:front_app/features/approval/data/repositories/approval_repository.dart';
import 'package:front_app/features/approval/presentation/pages/approval_requests_page.dart';
import 'package:front_app/features/approval/presentation/providers/approval_provider.dart';
import '../helpers.dart';

class MockApprovalRepository extends Mock implements ApprovalRepository {}

void main() {
  late MockApprovalRepository repo;
  late ApprovalProvider provider;

  setUp(() {
    repo = MockApprovalRepository();
    provider = ApprovalProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  Widget wrap() => wrapCupertinoPage(
        const ApprovalRequestsPage(),
        providers: [
          ChangeNotifierProvider<ApprovalProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染审批请求列表', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => [
          const ApprovalRequestModel(id: 1, title: '差旅报销', amount: 1200, reason: 'Q3 出差', status: 'pending', riskLevel: 'medium'),
          const ApprovalRequestModel(id: 2, title: '采购申请', amount: 800, reason: '显示器', status: 'approved', riskLevel: 'low'),
        ]);
    when(() => repo.getPolicies()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('审批中心'), findsOneWidget);
    expect(find.text('差旅报销'), findsOneWidget);
    expect(find.text('采购申请'), findsOneWidget);
    expect(find.textContaining('¥1200'), findsOneWidget);
    expect(find.textContaining('¥800'), findsOneWidget);
    expect(find.text('中'), findsOneWidget);
    expect(find.text('低'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => []);
    when(() => repo.getPolicies()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.textContaining('暂无审批'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('提交审批弹层校验必填', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status'))).thenAnswer((_) async => []);
    when(() => repo.getPolicies()).thenAnswer((_) async => []);

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('提交审批'), findsOneWidget);

    // 不填任何字段直接保存 → 提示
    await tester.tap(find.text('保存'));
    await tester.pump();
    expect(find.text('请填写标题、金额和事由'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
