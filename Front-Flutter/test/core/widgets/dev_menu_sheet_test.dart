// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/constants/app_constants.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/widgets/dev_menu_sheet.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrap(Widget home) => CupertinoApp(
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: home,
      );

  Widget opener() => Builder(
        builder: (context) => Center(
          child: CupertinoButton(
            onPressed: () => showDevMenuSheet(context),
            child: const Text('open'),
          ),
        ),
      );

  Future<void> pumpSheet(WidgetTester tester) async {
    await tester.pumpWidget(wrap(opener()));
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('渲染开发菜单（标题/环境/清除按钮）', (tester) async {
    await pumpSheet(tester);

    expect(find.text('开发调试'), findsOneWidget);
    expect(find.text('环境'), findsOneWidget);
    expect(find.text('清除所有数据'), findsOneWidget);
    // 环境预设标签
    for (final env in AppConstants.devEnvironments) {
      expect(find.text(env.label), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('切换环境写入 prefs 并弹确认框', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await pumpSheet(tester);

    await tester.tap(find.text('Stage'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400)); // sheet 收起 + dialog 弹出

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AppConstants.keyDevBaseUrl), AppConstants.devEnvironments[1].url);
    expect(find.text('已切换环境'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('清除数据写入确认', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await pumpSheet(tester);

    await tester.tap(find.text('清除所有数据'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AppConstants.keyDevBaseUrl), isNull);
    expect(find.text('本地数据已清除'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
