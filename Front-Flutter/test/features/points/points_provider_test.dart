import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/points/data/models/points_models.dart';
import 'package:front_app/features/points/data/repositories/points_repository.dart';
import 'package:front_app/features/points/presentation/providers/points_provider.dart';

class MockPointsRepository extends Mock implements PointsRepository {}

void main() {
  late MockPointsRepository repo;
  late PointsProvider provider;

  setUp(() {
    repo = MockPointsRepository();
    provider = PointsProvider(repo);
  });

  test('load 成功填充 overview / leaderboard / achievements', () async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: true, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer(
      (_) async => [LeaderboardRow(userId: 1, points: 100, nickname: 'Alice')],
    );
    when(() => repo.getAchievements()).thenAnswer(
      (_) async => [AchievementView(key: 'checkin_7', name: '连续签到 7 天', unlocked: false, progress: 3, target: 7)],
    );

    await provider.load();

    expect(provider.overview?.balance, 120);
    expect(provider.overview?.todayCheckedIn, true);
    expect(provider.overview?.streak, 3);
    expect(provider.leaderboard.single.nickname, 'Alice');
    expect(provider.achievements.single.key, 'checkin_7');
    expect(provider.loading, false);
    expect(provider.error, isNull);
  });

  test('load 失败 → error + 清空数据', () async {
    when(() => repo.getMyOverview()).thenThrow(Exception('网络错误'));

    await provider.load();

    expect(provider.error, isNotNull);
    expect(provider.overview, isNull);
    expect(provider.leaderboard, isEmpty);
    expect(provider.achievements, isEmpty);
  });

  test('checkIn 成功后刷新余额/连签/排行榜/成就', () async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: false, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer(
      (_) async => [LeaderboardRow(userId: 1, points: 100, nickname: 'Alice')],
    );
    when(() => repo.getAchievements()).thenAnswer((_) async => []);
    await provider.load();
    expect(provider.overview?.todayCheckedIn, false);

    when(() => repo.checkIn()).thenAnswer(
      (_) async => CheckInResult(points: 11, balance: 131, streak: 4),
    );
    when(() => repo.getLeaderboard()).thenAnswer(
      (_) async => [LeaderboardRow(userId: 1, points: 131, nickname: 'Alice')],
    );
    when(() => repo.getAchievements()).thenAnswer((_) async => []);

    final ok = await provider.checkIn();

    expect(ok, true);
    expect(provider.overview?.balance, 131);
    expect(provider.overview?.todayCheckedIn, true);
    expect(provider.overview?.streak, 4);
    expect(provider.lastCheckIn?.points, 11);
    expect(provider.leaderboard.single.points, 131);
  });

  test('checkIn 失败（409 今天已签到）→ 返回 false + error', () async {
    when(() => repo.getMyOverview()).thenAnswer(
      (_) async => PointsOverview(balance: 120, todayCheckedIn: false, streak: 3),
    );
    when(() => repo.getLeaderboard()).thenAnswer((_) async => []);
    when(() => repo.getAchievements()).thenAnswer((_) async => []);
    await provider.load();

    when(() => repo.checkIn()).thenThrow(Exception('今天已签到'));

    final ok = await provider.checkIn();

    expect(ok, false);
    expect(provider.error, isNotNull);
    expect(provider.checkingIn, false);
  });
}
