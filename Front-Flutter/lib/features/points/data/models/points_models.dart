// GROWTH-3：积分 / 签到 / 排行榜 / 成就 数据模型（消费 /points/*）。

class PointsOverview {
  final int balance;
  final bool todayCheckedIn;
  final int streak;

  PointsOverview({
    required this.balance,
    required this.todayCheckedIn,
    required this.streak,
  });

  factory PointsOverview.fromJson(Map<String, dynamic> json) {
    return PointsOverview(
      balance: (json['balance'] as num?)?.toInt() ?? 0,
      todayCheckedIn: json['todayCheckedIn'] as bool? ?? false,
      streak: (json['streak'] as num?)?.toInt() ?? 0,
    );
  }
}

class CheckInResult {
  final int points;
  final int balance;
  final int streak;

  CheckInResult({
    required this.points,
    required this.balance,
    required this.streak,
  });

  factory CheckInResult.fromJson(Map<String, dynamic> json) {
    return CheckInResult(
      points: (json['points'] as num?)?.toInt() ?? 0,
      balance: (json['balance'] as num?)?.toInt() ?? 0,
      streak: (json['streak'] as num?)?.toInt() ?? 0,
    );
  }
}

class LeaderboardRow {
  final int userId;
  final int points;
  final String? nickname;
  final String? avatarUrl;

  LeaderboardRow({
    required this.userId,
    required this.points,
    this.nickname,
    this.avatarUrl,
  });

  factory LeaderboardRow.fromJson(Map<String, dynamic> json) {
    return LeaderboardRow(
      userId: (json['userId'] as num?)?.toInt() ?? 0,
      points: (json['points'] as num?)?.toInt() ?? 0,
      nickname: json['nickname'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

class AchievementView {
  final String key;
  final String name;
  final bool unlocked;
  final int progress;
  final int target;

  AchievementView({
    required this.key,
    required this.name,
    required this.unlocked,
    required this.progress,
    required this.target,
  });

  factory AchievementView.fromJson(Map<String, dynamic> json) {
    return AchievementView(
      key: json['key'] as String? ?? '',
      name: json['name'] as String? ?? '',
      unlocked: json['unlocked'] as bool? ?? false,
      progress: (json['progress'] as num?)?.toInt() ?? 0,
      target: (json['target'] as num?)?.toInt() ?? 0,
    );
  }
}
