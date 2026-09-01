// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/version/data/models/app_version_info.dart';
import 'package:front_app/features/version/presentation/widgets/update_dialog.dart';

void main() {
  /// App 层注册 l10n：dialog 的 builder 用 AppLocalizations.of(ctx) 也能解析。
  Widget wrap(Widget home) => CupertinoApp(
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: home,
      );

  AppVersionInfo info() => const AppVersionInfo(
        latestVersion: '1.1.0',
        minRequiredVersion: '1.0.0',
        updateUrl: 'https://example.com/update',
        changelog: ['修复若干问题', '性能优化'],
      );

  Widget forceButton() => Builder(
        builder: (context) => Center(
          child: CupertinoButton(
            onPressed: () => showForceUpdateDialog(context, info()),
            child: const Text('open'),
          ),
        ),
      );

  Widget optionalButton() => Builder(
        builder: (context) => Center(
          child: CupertinoButton(
            onPressed: () => showOptionalUpdateDialog(context, info()),
            child: const Text('open'),
          ),
        ),
      );

  testWidgets('强制更新弹窗渲染标题/说明/更新日志', (tester) async {
    await tester.pumpWidget(wrap(forceButton()));
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('请升级到新版本'), findsOneWidget);
    expect(find.textContaining('当前版本过低'), findsOneWidget);
    expect(find.text('• 修复若干问题'), findsOneWidget);
    expect(find.text('• 性能优化'), findsOneWidget);
    expect(find.text('立即更新'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('引导更新弹窗可点「稍后」关闭', (tester) async {
    await tester.pumpWidget(wrap(optionalButton()));
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('发现新版本'), findsOneWidget);
    expect(find.text('稍后'), findsOneWidget);

    await tester.tap(find.text('稍后'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('发现新版本'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
