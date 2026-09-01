// SPDX-License-Identifier: Apache-2.0

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
      final items = data is List ? data : const <dynamic>[];
      final rows = <LeaderboardRow>[];
      for (final e in items) {
        // 类型检查后解析：单条坏数据跳过，不拖垮整个列表。
        if (e is Map) {
          rows.add(LeaderboardRow.fromJson(Map<String, dynamic>.from(e)));
        }
      }
      return rows;
    });
    return response.data ?? [];
  }

  Future<List<AchievementView>> getAchievements() async {
    final json = await _client.get('/points/achievements');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data is List ? data : const <dynamic>[];
      final rows = <AchievementView>[];
      for (final e in items) {
        // 类型检查后解析：单条坏数据跳过，不拖垮整个列表。
        if (e is Map) {
          rows.add(AchievementView.fromJson(Map<String, dynamic>.from(e)));
        }
      }
      return rows;
    });
    return response.data ?? [];
  }
}
