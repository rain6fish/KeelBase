import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Onboarding 首次引导状态（UX-8）：记录用户是否已看过引导页。
class OnboardingProvider extends ChangeNotifier {
  final SharedPreferences? _prefs;

  static const _key = 'onboarding_seen';

  bool _seen = false;
  bool _loaded = false;

  OnboardingProvider(this._prefs);

  bool get seen => _seen;
  bool get loaded => _loaded;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    final p = _prefs;
    if (p == null) return;
    _seen = p.getBool(_key) ?? false;
    notifyListeners();
  }

  Future<void> markSeen() async {
    _seen = true;
    notifyListeners();
    await _prefs?.setBool(_key, true);
  }
}
