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

  Future<bool> get supportsBiometrics async {
    try {
      return await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
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
    await _prefs.setBool(_keyEnabled, value);
    notifyListeners();
    return true;
  }

  /// 启动/恢复时验证生物识别。返回是否通过。
  Future<bool> authenticate() async {
    _checkedOnce = true;
    notifyListeners();
    if (!_enabled) return true;
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock KeelBase',
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
