// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleProvider extends ChangeNotifier {
  static const _keyLocale = 'app_locale';

  Locale _locale = const Locale('en', 'US');
  final SharedPreferences _prefs;

  LocaleProvider(this._prefs) {
    // 同步加载已持久化的语言：SharedPreferences 读是同步的，
    // 避免构造器里异步 `_loadLocale` 与 `setLocale` 之间的竞态
    //（旧的异步加载结果可能覆盖用户刚做的选择）。
    _loadLocale();
  }

  Locale get locale => _locale;

  /// 恢复已持久化语言。仅接受支持的语言（zh/en），其他语言按默认处理。
  void _loadLocale() {
    final restored = _restore(_prefs.getString(_keyLocale));
    if (restored != null) {
      _locale = restored;
    }
  }

  Locale? _restore(String? value) {
    if (value == null || value.isEmpty) return null;
    if (value.startsWith('zh')) return const Locale('zh', 'CN');
    if (value.startsWith('en')) return const Locale('en', 'US');
    return null;
  }

  Future<void> setLocale(Locale locale) async {
    // 先持久化成功再更新内存并通知，避免写失败时内存与存储不一致
    //（UI 已切语言但重启又回退）。
    final ok = await _prefs.setString(_keyLocale, locale.languageCode);
    if (!ok) return;
    _locale = locale;
    notifyListeners();
  }

  String get displayName {
    if (_locale.languageCode == 'zh') return '中文';
    return 'English';
  }
}
