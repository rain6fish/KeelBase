// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/points/data/models/points_models.dart';
import 'package:front_app/features/points/data/repositories/points_repository.dart';
import 'package:front_app/features/points/presentation/pages/points_page.dart';
import 'package:front_app/features/points/presentation/providers/points_provider.dart';

class MockPointsRepository extends Mock implements PointsRepository {}

Widget wrap(PointsProvider provider) {
  return CupertinoApp(
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: ChangeNotifierProvider<PointsProvider>.value(
      value: provider,
      child: const PointsPage(),
    ),
  );
}

void main() {
  late MockPointsRepository repo;
  late PointsProvider provider;

  setUp(() {
    repo = MockPointsRepository();
    provider = PointsProvider(repo);
  });

  testWidgets('渲染积分概览/成就/排行榜', (tester) async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: false, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer(
      (_) async => [LeaderboardRow(userId: 1, points: 100, nickname: 'Alice')],
    );
    when(() => repo.getAchievements()).thenAnswer(
      (_) async => [AchievementView(key: 'checkin_7', name: '连续签到 7 天', unlocked: false, progress: 3, target: 7)],
    );

    await tester.pumpWidget(wrap(provider));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('120'), findsOneWidget);
    expect(find.text('已连签 3 天'), findsOneWidget);
    expect(find.text('签到'), findsOneWidget);
    expect(find.text('连续签到 7 天'), findsOneWidget);
    expect(find.text('3 / 7'), findsOneWidget);
    expect(find.text('Alice'), findsOneWidget);
    expect(find.text('100'), findsOneWidget);
  });

  testWidgets('今日已签到 → 显示已签到状态，无签到按钮', (tester) async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: true, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer((_) async => []);
    when(() => repo.getAchievements()).thenAnswer((_) async => []);

    await tester.pumpWidget(wrap(provider));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('今日已签到'), findsOneWidget);
    expect(find.text('签到'), findsNothing);
  });

  testWidgets('点击签到 → 更新余额并提示获得积分', (tester) async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: false, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer((_) async => []);
    when(() => repo.getAchievements()).thenAnswer((_) async => []);
    when(() => repo.checkIn()).thenAnswer(
      (_) async => CheckInResult(points: 11, balance: 131, streak: 4),
    );

    await tester.pumpWidget(wrap(provider));
    await tester.pump();

    await tester.tap(find.text('签到'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('131'), findsOneWidget);
    expect(find.text('今日已签到'), findsOneWidget);
    expect(find.text('签到成功！获得 +11 积分'), findsOneWidget);

    // 冲刷 toast 的 2s 自动关闭计时器，避免 pending timer
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
  });
}
