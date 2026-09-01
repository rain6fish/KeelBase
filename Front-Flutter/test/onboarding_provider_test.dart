// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/features/onboarding/presentation/providers/onboarding_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('OnboardingProvider', () {
    test('默认未看过且未加载', () {
      final p = OnboardingProvider(null);
      expect(p.seen, false);
      expect(p.loaded, false);
    });

    test('load 后 loaded=true，无 prefs 时 seen 默认 false', () async {
      final p = OnboardingProvider(null);
      await p.load();
      expect(p.loaded, true);
      expect(p.seen, false);
    });

    test('markSeen 后 seen=true', () async {
      final p = OnboardingProvider(null);
      await p.markSeen();
      expect(p.seen, true);
    });

    test('有 prefs 时 load 读回已记录状态', () async {
      SharedPreferences.setMockInitialValues({'onboarding_seen': true});
      final prefs = await SharedPreferences.getInstance();
      final p = OnboardingProvider(prefs);
      await p.load();
      expect(p.loaded, true);
      expect(p.seen, true);
    });

    test('markSeen 持久化到 prefs，新实例能读回', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final p = OnboardingProvider(prefs);
      await p.markSeen();

      final p2 = OnboardingProvider(prefs);
      await p2.load();
      expect(p2.seen, true);
    });
  });
}
