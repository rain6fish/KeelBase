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

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        _repository.getMyOverview(),
        _repository.getLeaderboard(),
        _repository.getAchievements(),
      ]);
      _overview = results[0] as PointsOverview;
      _leaderboard = results[1] as List<LeaderboardRow>;
      _achievements = results[2] as List<AchievementView>;
    } catch (e) {
      _overview = null;
      _leaderboard = [];
      _achievements = [];
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// 每日签到；成功后刷新余额/连签/排行榜/成就。返回是否成功。
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
      final results = await Future.wait([
        _repository.getLeaderboard(),
        _repository.getAchievements(),
      ]);
      _leaderboard = results[0] as List<LeaderboardRow>;
      _achievements = results[1] as List<AchievementView>;
      return true;
    } catch (e) {
      _error = e.toString();
      return false;
    } finally {
      _checkingIn = false;
      notifyListeners();
    }
  }
}
