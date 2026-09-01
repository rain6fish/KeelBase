// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../data/models/points_models.dart';
import '../../data/repositories/points_repository.dart';

/// GROWTH-3：积分 / 签到 / 排行榜 / 成就 状态。
class PointsProvider extends ChangeNotifier {
  final PointsRepository _repository;

  PointsOverview? _overview;
  List<LeaderboardRow> _leaderboard = [];
  List<AchievementView> _achievements = [];
  bool _loading = false;
  bool _checkingIn = false;
  String? _error;
  CheckInResult? _lastCheckIn;

  PointsProvider(this._repository);

  PointsOverview? get overview => _overview;
  List<LeaderboardRow> get leaderboard => _leaderboard;
  List<AchievementView> get achievements => _achievements;
  bool get loading => _loading;
  bool get checkingIn => _checkingIn;
  String? get error => _error;
  CheckInResult? get lastCheckIn => _lastCheckIn;

  /// 加载积分页全量数据。按端点隔离异常：单个端点失败不清空其它已加载数据
  /// （保留部分/旧数据），`error` 仅表示有失败发生，具体文案由页面本地化展示。
  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    await Future.wait([
      _load(() async => _overview = await _repository.getMyOverview()),
      _load(() async => _leaderboard = await _repository.getLeaderboard()),
      _load(() async => _achievements = await _repository.getAchievements()),
    ]);
    _loading = false;
    notifyListeners();
  }

  /// 每日签到；成功后刷新余额/连签/排行榜/成就。返回是否成功。
  /// 签到本体成功即返回 true；排行榜/成就二次刷新失败不视为签到失败（保留旧数据）。
  Future<bool> checkIn() async {
    if (_checkingIn) return false;
    _checkingIn = true;
    _error = null;
    notifyListeners();
    try {
      final result = await _repository.checkIn();
      _lastCheckIn = result;
      _overview = PointsOverview(
        balance: result.balance,
        todayCheckedIn: true,
        streak: result.streak,
      );
      await _refreshRanking();
      return true;
    } catch (_) {
      _error = _friendlyMessage();
      return false;
    } finally {
      _checkingIn = false;
      notifyListeners();
    }
  }

  /// 签到后刷新排行榜与成就；任一失败保留旧榜单/成就数据，不影响签到结果。
  Future<void> _refreshRanking() async {
    try {
      final results = await Future.wait([
        _repository.getLeaderboard(),
        _repository.getAchievements(),
      ]);
      _leaderboard = results[0] as List<LeaderboardRow>;
      _achievements = results[1] as List<AchievementView>;
    } catch (_) {
      // 刷新失败：保留旧数据，签到仍视为成功。
    }
  }

  /// 执行单个端点加载，异常隔离并记录稳定错误标记（不向 UI 暴露异常原文）。
  Future<void> _load(Future<void> Function() task) async {
    try {
      await task();
    } catch (_) {
      _error = _friendlyMessage();
    }
  }

  /// 稳定友好的错误文案（页面通过 AppLocalizations 展示本地化文案，这里
  /// 仅保证 error != null 且不含底层异常文本）。
  String _friendlyMessage() => '数据加载失败，请稍后重试';
}
