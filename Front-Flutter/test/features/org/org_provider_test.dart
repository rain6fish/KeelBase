import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/org/data/models/org_models.dart';
import 'package:front_app/features/org/data/repositories/org_repository.dart';
import 'package:front_app/features/org/presentation/providers/org_provider.dart';

class MockOrgRepository extends Mock implements OrgRepository {}

void main() {
  late MockOrgRepository repo;
  late OrgProvider provider;

  setUp(() {
    repo = MockOrgRepository();
    provider = OrgProvider(repo);
  });

  test('load 成功填充 myOrg / tree / members', () async {
    when(() => repo.getMyOrg()).thenAnswer(
      (_) async => MyOrgInfo(id: 1, name: 'Acme', role: 'member', deptPath: const ['总部', '研发部']),
    );
    when(() => repo.getMyTree()).thenAnswer(
      (_) async => [OrgDeptNode(id: 1, name: '研发部', memberCount: 3)],
    );
    when(() => repo.getMyMembers()).thenAnswer(
      (_) async => [MyOrgMember(id: 5, nickname: 'Alice', role: 'admin', deptName: '研发部')],
    );

    await provider.load();

    expect(provider.myOrg?.name, 'Acme');
    expect(provider.myOrg?.deptPath, ['总部', '研发部']);
    expect(provider.tree.single.name, '研发部');
    expect(provider.tree.single.memberCount, 3);
    expect(provider.members.single.role, 'admin');
    expect(provider.loading, false);
    expect(provider.error, isNull);
    expect(provider.notInOrg, false);
  });

  test('load 失败（未加入组织 404）→ error + notInOrg', () async {
    when(() => repo.getMyOrg()).thenThrow(Exception('您不是任何组织的成员'));

    await provider.load();

    expect(provider.error, isNotNull);
    expect(provider.myOrg, isNull);
    expect(provider.notInOrg, true);
  });
}
