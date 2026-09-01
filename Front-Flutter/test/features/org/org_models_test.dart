// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/org/data/models/org_models.dart';

void main() {
  test('MyOrgInfo.fromJson 解析并处理缺省', () {
    final info = MyOrgInfo.fromJson({
      'org': {'id': 1, 'name': 'Acme'},
      'role': 'owner',
      'deptId': 3,
      'deptPath': ['技术部'],
    });
    expect(info.id, 1);
    expect(info.name, 'Acme');
    expect(info.role, 'owner');
    expect(info.deptPath, ['技术部']);

    final empty = MyOrgInfo.fromJson({});
    expect(empty.id, 0);
    expect(empty.role, 'member');
    expect(empty.deptPath, isEmpty);
  });

  test('OrgDeptNode.fromJson 递归解析 children', () {
    final node = OrgDeptNode.fromJson({
      'id': 1,
      'name': '技术部',
      'memberCount': 5,
      'children': [{'id': 2, 'name': '后端组', 'parentId': 1}],
    });
    expect(node.children, hasLength(1));
    expect(node.children.first.parentId, 1);
    expect(node.children.first.memberCount, 0);
  });

  test('MyOrgMember.fromJson 解析脱敏字段', () {
    final m = MyOrgMember.fromJson({'id': 1, 'nickname': 'alex', 'role': 'admin', 'deptName': '后端组'});
    expect(m.role, 'admin');
    expect(m.deptName, '后端组');
    expect(m.avatarUrl, isNull);
  });
}
