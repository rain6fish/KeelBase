// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/device_session_model.dart';
import '../../data/repositories/session_repository.dart';

/// 登录设备会话管理
class SessionProvider extends ChangeNotifier {
  final SessionRepository _repository;

  List<DeviceSessionModel> _sessions = [];
  bool _loading = false;
  String? _error;
  int? _revokingId;

  SessionProvider(this._repository);

  List<DeviceSessionModel> get sessions => _sessions;
  bool get loading => _loading;
  String? get error => _error;
  int? get revokingId => _revokingId;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _sessions = await _repository.getSessions();
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// 远程登出指定设备
  Future<bool> revoke(int id) async {
    _revokingId = id;
    notifyListeners();
    try {
      await _repository.revokeSession(id);
      _sessions = _sessions.where((s) => s.id != id).toList();
      _error = null;
      return true;
    } catch (e) {
      _error = e.toString();
      return false;
    } finally {
      _revokingId = null;
      notifyListeners();
    }
  }
}
