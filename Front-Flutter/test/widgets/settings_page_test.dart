// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_lock_provider.dart';
import 'package:front_app/core/services/locale_provider.dart';
import 'package:front_app/core/services/theme_provider.dart';
import 'package:front_app/features/settings/presentation/pages/settings_page.dart';
import 'package:front_app/features/version/presentation/providers/version_check_provider.dart';
import '../helpers.dart';

void main() {
  late SharedPreferences prefs;
  late MockVersionRepository versionRepository;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    versionRepository = MockVersionRepository();
    when(() => versionRepository.getVersionInfo()).thenThrow(Exception('offline'));
  });

  Widget wrap() => wrapCupertinoPage(
        const SettingsPage(),
        providers: [
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider(prefs)),
          ChangeNotifierProvider<LocaleProvider>(create: (_) => LocaleProvider(prefs)),
          ChangeNotifierProvider<AppLockProvider>(create: (_) => AppLockProvider(prefs)),
          ChangeNotifierProvider<VersionCheckProvider>(
            create: (_) => VersionCheckProvider(versionRepository),
          ),
        ],
      );

  testWidgets('渲染设置页各区块', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    expect(find.text('设置'), findsOneWidget);
    expect(find.byType(CupertinoSlidingSegmentedControl<AppThemeMode>), findsOneWidget);
    expect(find.text('外观'), findsWidgets);
    expect(find.text('语言'), findsOneWidget);
    expect(find.text('应用锁'), findsWidgets);
  });
}
