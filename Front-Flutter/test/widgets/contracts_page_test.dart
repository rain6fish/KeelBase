// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/contracts/data/models/contract_model.dart';
import 'package:front_app/features/contracts/data/repositories/contracts_repository.dart';
import 'package:front_app/features/contracts/presentation/pages/contracts_page.dart';
import 'package:front_app/features/contracts/presentation/providers/contracts_provider.dart';
import '../helpers.dart';

class MockContractsRepository extends Mock implements ContractsRepository {}

void main() {
  late MockContractsRepository repo;
  late ContractsProvider provider;

  setUp(() {
    repo = MockContractsRepository();
    provider = ContractsProvider(repo); // 默认 AppCache.unavailable
  });

  tearDown(() {
    provider.dispose();
  });

  ContractModel contract({int id = 1, String name = '采购合同'}) =>
      ContractModel(id: id, name: name, counterparty: '乙方公司', status: 'active', amount: 50000);

  Widget wrap() => wrapCupertinoPage(
        const ContractsPage(),
        providers: [
          ChangeNotifierProvider<ContractsProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染合同列表', (tester) async {
    when(() => repo.getContracts()).thenAnswer((_) async => [
          contract(),
          contract(id: 2, name: '服务合同'),
        ]);

    await pumpPage(tester);

    expect(find.text('合同'), findsOneWidget);
    expect(find.text('采购合同'), findsOneWidget);
    expect(find.text('服务合同'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('空列表显示空态', (tester) async {
    when(() => repo.getContracts()).thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('暂无合同'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('删除合同走确认弹层并移除', (tester) async {
    when(() => repo.getContracts()).thenAnswer((_) async => [
          contract(),
          contract(id: 2, name: '服务合同'),
        ]);
    when(() => repo.delete(1)).thenAnswer((_) async {});

    await pumpPage(tester);

    await tester.tap(find.byIcon(CupertinoIcons.trash).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('删除该合同？'), findsOneWidget);

    await tester.tap(find.text('删除'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repo.delete(1)).called(1);
    expect(find.text('采购合同'), findsNothing);
    expect(find.text('服务合同'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('新增合同弹层成功追加', (tester) async {
    when(() => repo.getContracts()).thenAnswer((_) async => []);
    when(() => repo.create(any())).thenAnswer((_) async => contract(id: 9, name: '新合同'));

    await pumpPage(tester);
    await tester.tap(find.byIcon(CupertinoIcons.add));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('新增合同'), findsOneWidget);

    await tester.enterText(find.byType(CupertinoTextField).first, '新合同');
    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400)); // 弹层收起动画

    verify(() => repo.create(any())).called(1);
    expect(find.text('新合同'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
