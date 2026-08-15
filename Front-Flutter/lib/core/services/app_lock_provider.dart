import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// UX-4 应用锁：开启后启动时用生物识别（FaceID/指纹）验证，保护隐私数据。
/// 偏好存 SharedPreferences；local_auth 负责系统级生物识别。
class AppLockProvider extends ChangeNotifier {
  static const _keyEnabled = 'app_lock_enabled';

  final SharedPreferences _prefs;
  final LocalAuthentication _auth;
  bool _enabled = false;
  bool _checkedOnce = false;

  AppLockProvider(this._prefs) : _auth = LocalAuthentication() {
    _enabled = _prefs.getBool(_keyEnabled) ?? false;
  }

  bool get enabled => _enabled;
  bool get checkedOnce => _checkedOnce;

  /// 是否支持应用锁：仅当设备**已录入生物特征**（FaceID/指纹）时为 true。
  /// 不叠加 `isDeviceSupported()` —— iOS 设了锁屏密码、Android 有硬件但未录入
  /// 时它都会误报 true，导致开启后永远无法解锁（用户锁死）。
  Future<bool> get supportsBiometrics async {
    try {
      return await _auth.canCheckBiometrics;
    } catch (_) {
      return false;
    }
  }

  /// 开关应用锁。开启前先确认设备支持生物识别。
  Future<bool> setEnabled(bool value) async {
    if (value) {
      final supported = await supportsBiometrics;
      if (!supported) return false;
    }
    _enabled = value;
    final ok = await _prefs.setBool(_keyEnabled, value);
    if (!ok) {
      // 持久化失败：回滚内存状态，避免 UI 声称已开启但重启后锁消失
      _enabled = !value;
      return false;
    }
    notifyListeners();
    return true;
  }

  /// 启动/恢复时验证生物识别。返回是否通过。
  ///
  /// `checkedOnce` 只在验证**成功**（或未开启直接放行）后置位，
  /// 失败/取消不会被误当成已解锁。
  Future<bool> authenticate() async {
    if (!_enabled) {
      _checkedOnce = true;
      notifyListeners();
      return true;
    }
    try {
      final ok = await _auth.authenticate(
        localizedReason: 'Unlock KeelBase',
        options: const AuthenticationOptions(
          biometricOnly: true,
          // stickyAuth: false —— 每次恢复都重新验证，不缓存本会话的成功结果
          stickyAuth: false,
        ),
      );
      if (ok) {
        _checkedOnce = true;
        notifyListeners();
      }
      return ok;
    } catch (_) {
      return false;
    }
  }
}
