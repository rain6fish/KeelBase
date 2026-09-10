// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_lock_provider.dart';
import 'package:front_app/core/services/locale_provider.dart';
import 'package:front_app/core/services/theme_provider.dart';
import 'package:front_app/core/api/provenance_provider.dart';
import 'package:front_app/core/api/provenance_repository.dart';
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

  Widget wrap({ProvenanceProvider? provenance}) => wrapCupertinoPage(
        const SettingsPage(),
        providers: [
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider(prefs)),
          ChangeNotifierProvider<LocaleProvider>(create: (_) => LocaleProvider(prefs)),
          ChangeNotifierProvider<AppLockProvider>(create: (_) => AppLockProvider(prefs)),
          ChangeNotifierProvider<VersionCheckProvider>(
            create: (_) => VersionCheckProvider(versionRepository),
          ),
          // FE-1：来源指纹未加载 → 隐藏该行（默认构造不 load）
          if (provenance != null)
            ChangeNotifierProvider<ProvenanceProvider>.value(value: provenance)
          else
            ChangeNotifierProvider<ProvenanceProvider>(
              create: (_) => ProvenanceProvider(ProvenanceRepository(MockApiClient())),
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

  testWidgets('FE-1：展示运行时来源指纹', (tester) async {
    final api = MockApiClient();
    when(() => api.get('/app/provenance')).thenAnswer((_) async => {
          'code': 200,
          'message': 'ok',
          'timestamp': 't',
          'data': {
            'source': {'manifestPresent': true, 'identity': 'keelbase-application'},
            'runtime': {
              'preset': 'full',
              'businessModules': [
                {'id': 'crm', 'label': 'CRM'}
              ],
              'aiToolFingerprint': {'total': 35, 'read': 28, 'write': 7, 'byRisk': <String, int>{}},
            },
          },
        });
    final prov = ProvenanceProvider(ProvenanceRepository(api));
    await prov.load();

    await tester.pumpWidget(wrap(provenance: prov));
    await tester.pump();

    expect(find.text('运行时来源指纹'), findsOneWidget);
    expect(find.textContaining('keelbase-application'), findsOneWidget);
    expect(find.textContaining('35'), findsOneWidget); // 工具总数
  });
}
