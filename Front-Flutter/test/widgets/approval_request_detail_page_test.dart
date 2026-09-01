// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/approval/data/models/approval_models.dart';
import 'package:front_app/features/approval/data/repositories/approval_repository.dart';
import 'package:front_app/features/approval/presentation/pages/approval_request_detail_page.dart';
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

  ApprovalRequestModel request({String status = 'pending', int id = 7}) =>
      ApprovalRequestModel(
        id: id,
        title: '差旅报销',
        amount: 1200,
        reason: 'Q3 出差费用',
        status: status,
        riskLevel: 'medium',
        aiRecommendation: '金额合理，建议通过',
      );

  Widget wrap() => wrapPushableCupertinoPage(
        const ApprovalRequestDetailPage(requestId: 7),
        providers: [
          ChangeNotifierProvider<ApprovalProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染审批详情卡片与 AI 预审按钮', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenAnswer((_) async => [request()]);

    await pumpPage(tester);

    expect(find.text('差旅报销'), findsWidgets);
    expect(find.textContaining('¥1200.00'), findsOneWidget);
    expect(find.text('事由：'), findsOneWidget);
    expect(find.text('Q3 出差费用'), findsOneWidget);
    expect(find.textContaining('AI 预审建议'), findsOneWidget);
    expect(find.text('AI 预审（按政策分级）'), findsOneWidget);
    expect(find.text('通过'), findsNothing);
    expect(find.text('驳回'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending 状态点击 AI 预审提示完成', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenAnswer((_) async => [request()]);
    when(() => repo.reviewRequest(7))
        .thenAnswer((_) async => request(status: 'needs_review'));

    await pumpPage(tester);
    await tester.tap(find.text('AI 预审（按政策分级）'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.reviewRequest(7)).called(1);
    expect(find.text('AI 预审完成'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('needs_review 状态展示通过/驳回并可决定', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenAnswer((_) async => [request(status: 'needs_review')]);
    when(() => repo.decideRequest(7, 'approved'))
        .thenAnswer((_) async => request(status: 'approved'));

    await pumpPage(tester);

    expect(find.text('通过'), findsOneWidget);
    expect(find.text('驳回'), findsOneWidget);

    await tester.tap(find.text('通过'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.decideRequest(7, 'approved')).called(1);
    expect(find.text('已决定'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('无请求时显示空态', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('审批中心'), findsOneWidget);
    expect(find.textContaining('暂无审批'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败显示错误信息', (tester) async {
    when(() => repo.getRequests(status: any(named: 'status')))
        .thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('网络错误'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
