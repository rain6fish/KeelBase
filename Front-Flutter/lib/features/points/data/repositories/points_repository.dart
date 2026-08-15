import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/points_models.dart';

/// GROWTH-3：积分 / 签到 / 排行榜 / 成就 数据源（消费 /points/*）。
class PointsRepository {
  final ApiClient _client;

  PointsRepository(this._client);

  Future<PointsOverview> getMyOverview() async {
    final json = await _client.get('/points/me');
    final response = ApiResponse.fromJson(
      json,
      (data) => PointsOverview.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<CheckInResult> checkIn() async {
    final json = await _client.post('/points/checkin');
    final response = ApiResponse.fromJson(
      json,
      (data) => CheckInResult.fromJson(data as Map<String, dynamic>),
    );
    return response.data!;
  }

  Future<List<LeaderboardRow>> getLeaderboard({int limit = 20}) async {
    final json = await _client.get('/points/leaderboard', queryParameters: {'limit': limit});
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => LeaderboardRow.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<List<AchievementView>> getAchievements() async {
    final json = await _client.get('/points/achievements');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => AchievementView.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }
}
