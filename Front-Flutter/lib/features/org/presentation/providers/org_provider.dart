// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/org_models.dart';
import '../../data/repositories/org_repository.dart';

/// ORG-7：我的组织 / 通讯录 状态。
class OrgProvider extends ChangeNotifier {
  final OrgRepository _repository;

  MyOrgInfo? _myOrg;
  List<OrgDeptNode> _tree = [];
  List<MyOrgMember> _members = [];
  bool _loading = false;
  String? _error;

  OrgProvider(this._repository);

  MyOrgInfo? get myOrg => _myOrg;
  List<OrgDeptNode> get tree => _tree;
  List<MyOrgMember> get members => _members;
  bool get loading => _loading;
  String? get error => _error;

  /// 是否未加入任何组织（后端 404 场景）。
  bool get notInOrg => _error != null && _myOrg == null;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        _repository.getMyOrg(),
        _repository.getMyTree(),
        _repository.getMyMembers(),
      ]);
      _myOrg = results[0] as MyOrgInfo?;
      _tree = results[1] as List<OrgDeptNode>;
      _members = results[2] as List<MyOrgMember>;
    } catch (e) {
      _myOrg = null;
      _tree = [];
      _members = [];
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void clear() {
    _myOrg = null;
    _tree = [];
    _members = [];
    _error = null;
    notifyListeners();
  }
}
