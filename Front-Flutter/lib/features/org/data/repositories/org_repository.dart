import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/org_models.dart';

/// ORG-7：我的组织 / 通讯录 数据源（只读）。
class OrgRepository {
  final ApiClient _client;

  OrgRepository(this._client);

  Future<MyOrgInfo?> getMyOrg() async {
    final json = await _client.get('/org/my');
    final response = ApiResponse.fromJson(
      json,
      (data) => MyOrgInfo.fromJson(data as Map<String, dynamic>),
    );
    return response.data;
  }

  Future<List<OrgDeptNode>> getMyTree() async {
    final json = await _client.get('/org/my/tree');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => OrgDeptNode.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<List<MyOrgMember>> getMyMembers() async {
    final json = await _client.get('/org/my/members');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => MyOrgMember.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }
}
