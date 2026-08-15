import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/org/data/models/org_models.dart';
import 'package:front_app/features/org/presentation/pages/my_org_page.dart';
import 'package:front_app/features/org/presentation/providers/org_provider.dart';
import '../helpers.dart';

void main() {
  late MockOrgRepository repository;

  setUp(() {
    repository = MockOrgRepository();
    when(() => repository.getMyOrg()).thenAnswer((_) async => MyOrgInfo(
      id: 1,
      name: 'Acme',
      role: 'owner',
      deptId: 2,
      deptPath: const ['技术部'],
    ));
    when(() => repository.getMyTree()).thenAnswer((_) async => [
      OrgDeptNode(id: 2, name: '技术部', memberCount: 5, children: [
        OrgDeptNode(id: 3, name: '后端组', memberCount: 3, parentId: 2),
      ]),
    ]);
    when(() => repository.getMyMembers()).thenAnswer((_) async => [
      MyOrgMember(id: 1, nickname: 'alex', role: 'owner', deptName: '技术部'),
    ]);
  });

  Widget wrap() => wrapCupertinoPage(
        const MyOrgPage(),
        providers: [
          ChangeNotifierProvider<OrgProvider>(
            create: (_) => OrgProvider(repository),
          ),
        ],
      );

  testWidgets('渲染我的组织信息与部门树', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('我的组织'), findsOneWidget);
    expect(find.text('Acme'), findsOneWidget);
    expect(find.text('技术部'), findsWidgets);
    expect(find.text('后端组'), findsOneWidget);
  });
}
