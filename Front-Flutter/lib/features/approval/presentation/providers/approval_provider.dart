// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/repositories/approval_repository.dart';
import '../../data/models/approval_models.dart';

/// AI Approval：审批请求列表 + 操作状态管理
class ApprovalProvider extends ChangeNotifier {
  final ApprovalRepository _repository;

  List<ApprovalRequestModel> _requests = [];
  List<ApprovalPolicyModel> _policies = [];
  bool _loading = false;
  String? _error;

  ApprovalProvider(this._repository);

  List<ApprovalRequestModel> get requests => _requests;
  List<ApprovalPolicyModel> get policies => _policies;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> loadRequests({String? status}) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _requests = await _repository.getRequests(status: status);
    } catch (e) {
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> loadPolicies() async {
    try {
      _policies = await _repository.getPolicies();
    } catch (_) {}
  }

  Future<bool> createRequest(Map<String, dynamic> data) async {
    try {
      await _repository.createRequest(data);
      await loadRequests();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<ApprovalRequestModel?> reviewRequest(int id) async {
    try {
      final updated = await _repository.reviewRequest(id);
      await loadRequests();
      return updated;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<ApprovalRequestModel?> decideRequest(int id, String decision) async {
    try {
      final updated = await _repository.decideRequest(id, decision);
      await loadRequests();
      return updated;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }
}
