// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/suppliers/data/models/supplier_model.dart';
import 'package:front_app/features/suppliers/data/repositories/suppliers_repository.dart';
import 'package:front_app/features/suppliers/presentation/pages/suppliers_page.dart';
import 'package:front_app/features/suppliers/presentation/providers/suppliers_provider.dart';
import '../helpers.dart';

class MockSuppliersRepository extends Mock implements SuppliersRepository {}

void main() {
  late MockSuppliersRepository repo;
  late SuppliersProvider provider;

  setUp(() {
    repo = MockSuppliersRepository();
    provider = SuppliersProvider(repo); // 默认 AppCache.unavailable
  });

  tearDown(() {
    provider.dispose();
  });

  SupplierModel supplier({int id = 1, String name = '华东供应商'}) =>
      SupplierModel(id: id, name: name, contact: '张三', status: 'active', riskLevel: 'low', annualSpend: 100000);

  Widget wrap() => wrapCupertinoPage(
        const SuppliersPage(),
        providers: [
          ChangeNotifierProvider<SuppliersProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染供应商列表', (tester) async {
    when(() => repo.getSuppliers()).thenAnswer((_) async => [
          supplier(),
          supplier(id: 2, name: '华南供应商'),
        ]);

    await pumpPage(tester);

    expect(find.text('供应商'), findsOneWidget);
    expect(find.text('华东供应商'), findsOneWidget);
    expect(find.text('华南供应商'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getSuppliers()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('暂无供应商'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('删除供应商走确认弹层并移除', (tester) async {
    when(() => repo.getSuppliers()).thenAnswer((_) async => [
          supplier(),
          supplier(id: 2, name: '华南供应商'),
        ]);
    when(() => repo.delete(1)).thenAnswer((_) async {});

    await pumpPage(tester);

    await tester.tap(find.byIcon(CupertinoIcons.trash).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('删除该供应商？'), findsOneWidget);

    await tester.tap(find.text('删除'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.delete(1)).called(1);
    expect(find.text('华东供应商'), findsNothing);
    expect(find.text('华南供应商'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('新增供应商弹层成功追加', (tester) async {
    when(() => repo.getSuppliers()).thenAnswer((_) async => []);
    when(() => repo.create(any())).thenAnswer((_) async => supplier(id: 9, name: '新供应商'));

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增供应商'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField).first, '新供应商');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400)); // 弹层收起动画

    verify(() => repo.create(any())).called(1);
    expect(find.text('新供应商'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
