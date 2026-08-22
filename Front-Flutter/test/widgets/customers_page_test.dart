import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/crm/data/models/customer_model.dart';
import 'package:front_app/features/crm/data/repositories/crm_repository.dart';
import 'package:front_app/features/crm/presentation/pages/customers_page.dart';
import 'package:front_app/features/crm/presentation/providers/crm_provider.dart';
import '../helpers.dart';

class MockCrmRepository extends Mock implements CrmRepository {}

void main() {
  late MockCrmRepository repo;
  late CrmProvider provider;

  setUp(() {
    repo = MockCrmRepository();
    provider = CrmProvider(repo);
  });

  tearDown(() {
    provider.dispose();
  });

  Widget wrap() => wrapCupertinoPage(
        const CustomersPage(),
        providers: [
          ChangeNotifierProvider<CrmProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染客户列表', (tester) async {
    when(() => repo.getCustomers()).thenAnswer((_) async => [
          const CustomerModel(id: 1, name: '华润', company: '华润集团', status: 'active', riskLevel: 'high'),
          const CustomerModel(id: 2, name: '腾讯', status: 'lead', riskLevel: 'low'),
        ]);

    await pumpPage(tester);

    expect(find.text('客户管理'), findsOneWidget);
    expect(find.text('华润'), findsOneWidget);
    expect(find.text('腾讯'), findsOneWidget);
    expect(find.text('高'), findsOneWidget); // high 风险标签
    expect(find.text('低'), findsOneWidget); // low 风险标签
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getCustomers()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.textContaining('暂无客户'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('加载失败时列表为空态', (tester) async {
    when(() => repo.getCustomers()).thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('暂无客户'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('新增客户弹层校验空名称', (tester) async {
    when(() => repo.getCustomers()).thenAnswer((_) async => []);

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增客户'), findsOneWidget);

    // 不填名称直接保存 → 提示
    await tester.tap(find.text('保存'));
    await tester.pump();
    expect(find.text('请输入客户名称'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('新增客户成功提示', (tester) async {
    when(() => repo.getCustomers()).thenAnswer((_) async => []);
    when(() => repo.createCustomer(any())).thenAnswer((_) async =>
        const CustomerModel(id: 3, name: '新客户'));

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(find.byType(CupertinoTextField).first, '新客户');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.createCustomer(any())).called(1);
    expect(find.text('已保存'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
