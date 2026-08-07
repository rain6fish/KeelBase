import 'package:flutter/foundation.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/utils/version_utils.dart';
import '../../data/models/app_version_info.dart';
import '../../data/repositories/version_repository.dart';

enum AppUpdateDecision { none, optional, forced }

/// 版本检查状态管理：启动/设置页调用 [check]，按版本对比得出更新决策。
class VersionCheckProvider extends ChangeNotifier {
  final VersionRepository _repository;
  final String _currentVersion;

  AppVersionInfo? _info;
  AppUpdateDecision _decision = AppUpdateDecision.none;
  bool _checked = false;

  VersionCheckProvider(this._repository, {this._currentVersion = AppConstants.appVersion});

  AppVersionInfo? get info => _info;
  AppUpdateDecision get decision => _decision;
  bool get checked => _checked;

  /// 拉取版本元数据并对比；网络失败/解析失败不阻塞，视为无更新。
  Future<AppUpdateDecision> check() async {
    try {
      final info = await _repository.getVersionInfo();
      _info = info;
      final latestCmp = compareVersions(_currentVersion, info.latestVersion);
      final minCmp = compareVersions(_currentVersion, info.minRequiredVersion);
      if (minCmp < 0) {
        _decision = AppUpdateDecision.forced;
      } else if (latestCmp < 0) {
        _decision = AppUpdateDecision.optional;
      } else {
        _decision = AppUpdateDecision.none;
      }
    } catch (_) {
      _decision = AppUpdateDecision.none;
    }
    _checked = true;
    notifyListeners();
    return _decision;
  }
}
