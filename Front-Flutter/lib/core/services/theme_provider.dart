import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// iOS-style theme mode: same semantics as Material's ThemeMode but no Material dependency.
enum AppThemeMode { system, light, dark }

class ThemeProvider extends ChangeNotifier {
  AppThemeMode _themeMode = AppThemeMode.system;
  final SharedPreferences _prefs;

  ThemeProvider(this._prefs) {
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
        // Fallback to light — CupertinoTheme will respect platform
        return Brightness.light;
    }
  }

  Future<void> _loadTheme() async {
    final value = _prefs.getString('theme_mode');
    if (value != null) {
      _themeMode = AppThemeMode.values.firstWhere(
        (e) => e.name == value,
        orElse: () => AppThemeMode.system,
      );
      notifyListeners();
    }
  }

  Future<void> setThemeMode(AppThemeMode mode) async {
    _themeMode = mode;
    await _prefs.setString('theme_mode', mode.name);
    notifyListeners();
  }
}
