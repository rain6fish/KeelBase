// ORG-7：我的组织 / 通讯录 数据模型（消费 /org/my, /org/my/tree, /org/my/members）。

class MyOrgInfo {
  final int id;
  final String name;
  final String? description;
  final String role;
  final int? deptId;
  final List<String> deptPath;

  MyOrgInfo({
    required this.id,
    required this.name,
    this.description,
    required this.role,
    this.deptId,
    this.deptPath = const [],
  });

  factory MyOrgInfo.fromJson(Map<String, dynamic> json) {
    final org = json['org'] as Map<String, dynamic>? ?? const {};
    return MyOrgInfo(
      id: (org['id'] as num?)?.toInt() ?? 0,
      name: org['name'] as String? ?? '',
      description: org['description'] as String?,
      role: json['role'] as String? ?? 'member',
      deptId: (json['deptId'] as num?)?.toInt(),
      deptPath: (json['deptPath'] as List?)?.cast<String>() ?? const [],
    );
  }
}

class OrgDeptNode {
  final int id;
  final String name;
  final int? parentId;
  final int memberCount;
  final List<OrgDeptNode> children;

  OrgDeptNode({
    required this.id,
    required this.name,
    this.parentId,
    this.memberCount = 0,
    this.children = const [],
  });

  factory OrgDeptNode.fromJson(Map<String, dynamic> json) {
    return OrgDeptNode(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      parentId: (json['parentId'] as num?)?.toInt(),
      memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
      children: (json['children'] as List?)
              ?.map((e) => OrgDeptNode.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

class MyOrgMember {
  final int id;
  final String? nickname;
  final String? avatarUrl;
  final String role;
  final String? deptName;

  MyOrgMember({
    required this.id,
    this.nickname,
    this.avatarUrl,
    required this.role,
    this.deptName,
  });

  factory MyOrgMember.fromJson(Map<String, dynamic> json) {
    return MyOrgMember(
      id: (json['id'] as num?)?.toInt() ?? 0,
      nickname: json['nickname'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String? ?? 'member',
      deptName: json['deptName'] as String?,
    );
  }
}
