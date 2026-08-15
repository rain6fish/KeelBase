import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// iOS-style theme mode: same semantics as Material's ThemeMode but no Material dependency.
enum AppThemeMode { system, light, dark }

class ThemeProvider extends ChangeNotifier {
  static const _keyThemeMode = 'theme_mode';

  AppThemeMode _themeMode = AppThemeMode.system;
  final SharedPreferences _prefs;

  ThemeProvider(this._prefs) {
    // 同步加载已持久化的主题模式：SharedPreferences 读是同步的，
    // 避免构造器里异步 `_loadTheme` 与 `setThemeMode` 之间的竞态
    //（旧的持久化值可能覆盖用户刚做的选择）。
    _loadTheme();
  }

  AppThemeMode get themeMode => _themeMode;

  Brightness get brightness {
    switch (_themeMode) {
      case AppThemeMode.light:
        return Brightness.light;
      case AppThemeMode.dark:
        return Brightness.dark;
      case AppThemeMode.system:
        // 跟随系统实际亮度；显式传 brightness 到 CupertinoTheme 时
        // 会被原样采用，不能硬编码 light，否则深色系统下永不生效。
        return WidgetsBinding.instance.platformDispatcher.platformBrightness;
    }
  }

  void _loadTheme() {
    final value = _prefs.getString(_keyThemeMode);
    if (value != null) {
      _themeMode = AppThemeMode.values.firstWhere(
        (e) => e.name == value,
        orElse: () => AppThemeMode.system,
      );
    }
  }

  Future<void> setThemeMode(AppThemeMode mode) async {
    // 先持久化成功再更新内存并通知，避免写失败时 UI 声称已切换
    // 但存储仍是旧值（重启回退）。
    final ok = await _prefs.setString(_keyThemeMode, mode.name);
    if (!ok) return;
    _themeMode = mode;
    notifyListeners();
  }
}
