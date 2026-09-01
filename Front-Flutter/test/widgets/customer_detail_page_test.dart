// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/crm/data/models/crm_activity_model.dart';
import 'package:front_app/features/crm/data/models/crm_order_model.dart';
import 'package:front_app/features/crm/data/models/crm_risk_model.dart';
import 'package:front_app/features/crm/data/models/crm_task_model.dart';
import 'package:front_app/features/crm/data/models/customer_detail_model.dart';
import 'package:front_app/features/crm/data/models/customer_model.dart';
import 'package:front_app/features/crm/data/repositories/crm_repository.dart';
import 'package:front_app/features/crm/presentation/pages/customer_detail_page.dart';
import 'package:front_app/features/crm/presentation/providers/crm_provider.dart';
import '../helpers.dart';

class MockCrmRepository extends Mock implements CrmRepository {}

void main() {
  late MockCrmRepository repo;
  late MockApiClient apiClient;
  late CrmProvider provider;

  setUp(() {
    repo = MockCrmRepository();
    apiClient = MockApiClient();
    provider = CrmProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  CustomerDetailModel fullDetail() => CustomerDetailModel(
        customer: const CustomerModel(
          id: 1,
          name: '华润',
          company: '华润集团',
          email: 'hr@example.com',
          status: 'active',
          riskLevel: 'high',
          notes: '重要客户',
        ),
        orders: [
          const CrmOrderModel(id: 1, customerId: 1, amount: 5000, status: 'pending'),
        ],
        activities: [
          const CrmActivityModel(id: 1, customerId: 1, summary: '参加评审会', type: 'meeting'),
        ],
        tasks: [
          const CrmTaskModel(id: 1, customerId: 1, title: '跟进签约', status: 'pending'),
        ],
        risks: [
          const CrmRiskModel(id: 1, customerId: 1, level: 'medium', reason: '付款周期长'),
        ],
      );

  Widget wrap() => wrapPushableCupertinoPage(
        const CustomerDetailPage(customerId: 1),
        providers: [
          ChangeNotifierProvider<CrmProvider>.value(value: provider),
          Provider<ApiClient>.value(value: apiClient),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump(); // 开始 push
    await tester.pump(const Duration(milliseconds: 400)); // 路由转场
    await tester.pump(const Duration(milliseconds: 100)); // 异步加载
  }

  testWidgets('渲染客户详情（订单/跟进/任务/风险）', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => fullDetail());

    await pumpPage(tester);

    expect(find.textContaining('华润'), findsWidgets);
    expect(find.text('订单'), findsOneWidget);
    expect(find.text('跟进记录'), findsOneWidget);
    expect(find.text('任务'), findsOneWidget);
    expect(find.text('风险'), findsOneWidget);
    expect(find.textContaining('¥5000'), findsOneWidget);
    expect(find.text('参加评审会'), findsOneWidget);
    expect(find.text('跟进签约'), findsOneWidget);
    expect(find.textContaining('付款周期长'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('无子资源时显示各空态文案', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => CustomerDetailModel(
          customer: const CustomerModel(id: 1, name: '华润'),
        ));

    await pumpPage(tester);

    expect(find.text('暂无订单'), findsOneWidget);
    expect(find.text('暂无跟进记录'), findsOneWidget);
    expect(find.text('暂无任务'), findsOneWidget);
    expect(find.text('暂无风险记录'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败显示错误信息', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('网络错误'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击风险分析渲染结果与成功 toast', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => fullDetail());
    when(() => apiClient.get('/crm/customers/1/analyze')).thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'data': {'level': 'high', 'score': 75, 'reasons': ['现金流紧张', '续约风险']},
          'timestamp': '2026-08-22T00:00:00Z',
        });

    await pumpPage(tester);
    await tester.tap(find.text('风险分析'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('风险等级'), findsOneWidget);
    expect(find.text('• 现金流紧张'), findsOneWidget);
    expect(find.text('分析完成'), findsOneWidget);

    // flush toast 的 2 秒自动消失 timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('风险分析失败显示错误 toast', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => fullDetail());
    when(() => apiClient.get('/crm/customers/1/analyze')).thenThrow(Exception('分析接口失败'));

    await pumpPage(tester);
    await tester.tap(find.text('风险分析'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('分析接口失败'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('新增跟进任务后提示成功', (tester) async {
    when(() => repo.getCustomerDetail(1)).thenAnswer((_) async => fullDetail());
    when(() => repo.createTask(
          customerId: any(named: 'customerId'),
          title: any(named: 'title'),
          description: any(named: 'description'),
          dueDate: any(named: 'dueDate'),
        )).thenAnswer((_) async {});

    await pumpPage(tester);
    // 任务 section 标题行内的 add 按钮
    final addInTasks = find.descendant(
      of: find.widgetWithText(Row, '任务'),
      matching: find.byType(CupertinoButton),
    );
    await tester.ensureVisible(addInTasks);
    await tester.pump();
    await tester.tap(addInTasks);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增跟进任务'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField), '联系客户');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.createTask(
          customerId: 1,
          title: '联系客户',
          description: any(named: 'description'),
          dueDate: any(named: 'dueDate'),
        )).called(1);
    expect(find.text('已保存'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
