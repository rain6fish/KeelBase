import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleProvider extends ChangeNotifier {
  Locale _locale = const Locale('en', 'US');
  final SharedPreferences _prefs;

  LocaleProvider(this._prefs) {
    _loadLocale();
  }

  Locale get locale => _locale;

  Future<void> _loadLocale() async {
    final value = _prefs.getString('app_locale');
    if (value == 'zh') {
      _locale = const Locale('zh', 'CN');
      notifyListeners();
    }
  }

  Future<void> setLocale(Locale locale) async {
    _locale = locale;
    await _prefs.setString('app_locale', locale.languageCode);
    notifyListeners();
  }

  String get displayName {
    if (_locale.languageCode == 'zh') return '中文';
    return 'English';
  }
}
