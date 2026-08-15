import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/points/data/repositories/points_repository.dart';
import '../../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late PointsRepository repository;

  setUp(() {
    apiClient = MockApiClient();
    repository = PointsRepository(apiClient);
  });

  Map<String, dynamic> res(dynamic data) => {
        'code': 200,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-15T10:00:00Z',
      };

  test('getMyOverview 解析概览（余额/今日已签/连签）', () async {
    when(() => apiClient.get('/points/me')).thenAnswer(
      (_) async => res({'balance': 120, 'todayCheckedIn': true, 'streak': 3}),
    );

    final overview = await repository.getMyOverview();

    expect(overview.balance, 120);
    expect(overview.todayCheckedIn, true);
    expect(overview.streak, 3);
  });

  test('checkIn POST /points/checkin 返回本次积分+余额+连签', () async {
    when(() => apiClient.post('/points/checkin')).thenAnswer(
      (_) async => res({'points': 11, 'balance': 131, 'streak': 4}),
    );

    final result = await repository.checkIn();

    expect(result.points, 11);
    expect(result.balance, 131);
    expect(result.streak, 4);
    verify(() => apiClient.post('/points/checkin')).called(1);
  });

  test('getLeaderboard 解析排行榜（脱敏昵称/头像）', () async {
    when(() => apiClient.get('/points/leaderboard', queryParameters: any(named: 'queryParameters'))).thenAnswer(
      (_) async => res([
        {'userId': 1, 'points': 100, 'nickname': 'Alice', 'avatarUrl': null},
        {'userId': 2, 'points': 60, 'nickname': null, 'avatarUrl': null},
      ]),
    );

    final rows = await repository.getLeaderboard(limit: 20);

    expect(rows, hasLength(2));
    expect(rows.first.points, 100);
    expect(rows.first.nickname, 'Alice');
    expect(rows.last.nickname, isNull);
  });

  test('getAchievements 解析成就列表', () async {
    when(() => apiClient.get('/points/achievements')).thenAnswer(
      (_) async => res([
        {'key': 'checkin_7', 'name': '连续签到 7 天', 'unlocked': false, 'progress': 3, 'target': 7},
        {'key': 'points_100', 'name': '累计 100 积分', 'unlocked': true, 'progress': 100, 'target': 100},
      ]),
    );

    final achievements = await repository.getAchievements();

    expect(achievements, hasLength(2));
    expect(achievements.first.unlocked, false);
    expect(achievements.first.progress, 3);
    expect(achievements.last.unlocked, true);
  });

  test('空列表返回空数组', () async {
    when(() => apiClient.get('/points/leaderboard', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => res(null));

    final rows = await repository.getLeaderboard();

    expect(rows, isEmpty);
  });
}
