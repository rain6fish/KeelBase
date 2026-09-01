// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/org/data/repositories/org_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late OrgRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = OrgRepository(apiClient);
  });

  test('getMyOrg 解析组织信息（含 org 嵌套）', () async {
    when(() => apiClient.get('/org/my')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': {
        'org': {'id': 1, 'name': 'Acme', 'description': 'd'},
        'role': 'owner',
        'deptId': 3,
        'deptPath': ['技术部', '后端组'],
      },
      'timestamp': '',
    });

    final info = await repository.getMyOrg();
    expect(info, isNotNull);
    expect(info!.name, 'Acme');
    expect(info.role, 'owner');
    expect(info.deptId, 3);
    expect(info.deptPath, ['技术部', '后端组']);
  });

  test('getMyOrg data 为 null 时返回 null', () async {
    when(() => apiClient.get('/org/my')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': null,
      'timestamp': '',
    });
    expect(await repository.getMyOrg(), isNull);
  });

  test('getMyTree 解析部门树（含递归 children）', () async {
    when(() => apiClient.get('/org/my/tree')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {
          'id': 1,
          'name': '技术部',
          'parentId': null,
          'memberCount': 5,
          'children': [
            {'id': 2, 'name': '后端组', 'parentId': 1, 'memberCount': 3},
          ],
        },
      ],
      'timestamp': '',
    });

    final tree = await repository.getMyTree();
    expect(tree, hasLength(1));
    expect(tree.first.children, hasLength(1));
    expect(tree.first.children.first.name, '后端组');
  });

  test('getMyMembers 解析脱敏成员列表', () async {
    when(() => apiClient.get('/org/my/members')).thenAnswer((_) async => {
      'code': 200,
      'message': 'ok',
      'data': [
        {'id': 1, 'nickname': 'alex', 'role': 'owner', 'deptName': '后端组'},
      ],
      'timestamp': '',
    });
    final members = await repository.getMyMembers();
    expect(members, hasLength(1));
    expect(members.first.role, 'owner');
    expect(members.first.deptName, '后端组');
  });
}
