/// 数据洞察（UX-5）：复用 POST /ai/insights 的聚合结果渲染图表。
class InsightsModel {
  final int totalEvents;
  final int activeEvents;
  final int cancelledEvents;
  final int recentEvents;
  final String? earliestEventAt;
  final String? latestEventAt;
  final List<MonthlyCount> monthlyBreakdown;
  final String summary;

  InsightsModel({
    required this.totalEvents,
    required this.activeEvents,
    required this.cancelledEvents,
    required this.recentEvents,
    this.earliestEventAt,
    this.latestEventAt,
    required this.monthlyBreakdown,
    required this.summary,
  });

  factory InsightsModel.fromJson(Map<String, dynamic> json) {
    final rawStats = json['stats'];
    final stats = rawStats is Map ? Map<String, dynamic>.from(rawStats) : <String, dynamic>{};
    return InsightsModel(
      totalEvents: stats['totalEvents'] as int? ?? 0,
      activeEvents: stats['activeEvents'] as int? ?? 0,
      cancelledEvents: stats['cancelledEvents'] as int? ?? 0,
      recentEvents: stats['recentEvents'] as int? ?? 0,
      earliestEventAt: stats['earliestEventAt'] as String?,
      latestEventAt: stats['latestEventAt'] as String?,
      monthlyBreakdown: (stats['monthlyBreakdown'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(MonthlyCount.fromJson)
          .toList(),
      summary: json['summary'] as String? ?? '',
    );
  }

  bool get isEmpty => totalEvents == 0;
}

class MonthlyCount {
  final String month;
  final int count;

  MonthlyCount({required this.month, required this.count});

  factory MonthlyCount.fromJson(Map<String, dynamic> json) => MonthlyCount(
        month: json['month'] as String? ?? '',
        count: json['count'] as int? ?? 0,
      );
}
