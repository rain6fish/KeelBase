import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/cupertino.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../data/models/insights_model.dart';

/// Dashboard 上的数据可视化卡片（UX-5）：月度事件分布柱状图 + 统计概览。
class InsightsCard extends StatelessWidget {
  final InsightsModel? insights;
  final bool loading;
  final String? error;
  final VoidCallback? onRetry;

  const InsightsCard({
    super.key,
    this.insights,
    required this.loading,
    this.error,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);

    if (loading) {
      return _card(context, theme, child: const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(child: CupertinoActivityIndicator()),
      ));
    }

    if (error != null) {
      return _card(context, theme, child: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(l10n.insightsError, style: TextStyle(fontSize: 14, color: CupertinoColors.systemGrey.resolveFrom(context))),
        ),
        CupertinoButton(onPressed: onRetry, child: Text(l10n.retry)),
      ]));
    }

    final data = insights;
    if (data == null || data.isEmpty) {
      return _card(context, theme, child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(l10n.insightsEmpty, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: CupertinoColors.systemGrey.resolveFrom(context))),
      ));
    }

    return _card(context, theme, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(CupertinoIcons.chart_bar_alt_fill, size: 18, color: theme.primaryColor),
        const SizedBox(width: 8),
        Text(l10n.insightsTitle, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: theme.textTheme.textStyle.color)),
      ]),
      const SizedBox(height: 14),
      _statsRow(context, theme, data),
      const SizedBox(height: 16),
      if (data.monthlyBreakdown.isNotEmpty) ...[
        Text(l10n.eventsByMonth, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: CupertinoColors.systemGrey.resolveFrom(context))),
        const SizedBox(height: 10),
        SizedBox(height: 140, child: _MonthlyBarChart(data.monthlyBreakdown, theme.primaryColor)),
      ],
      const SizedBox(height: 10),
      Text(data.summary, style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey.resolveFrom(context))),
    ]));
  }

  Widget _card(BuildContext context, CupertinoThemeData theme, {required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: CupertinoColors.systemBackground.resolveFrom(context),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: CupertinoColors.black.withAlpha(8), blurRadius: 8, offset: const Offset(0, 1))],
      ),
      child: child,
    );
  }

  Widget _statsRow(BuildContext context, CupertinoThemeData theme, InsightsModel data) {
    final l10n = context.l10n;
    final items = [
      (l10n.insightsTotal, data.totalEvents, theme.primaryColor),
      (l10n.insightsActive, data.activeEvents, CupertinoColors.systemGreen),
      (l10n.insightsCancelled, data.cancelledEvents, CupertinoColors.systemRed),
      (l10n.insightsRecent, data.recentEvents, CupertinoColors.systemOrange),
    ];
    return Row(children: items.map((it) {
      return Expanded(child: Column(children: [
        Text('${it.$2}', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: it.$3)),
        const SizedBox(height: 2),
        Text(it.$1, style: TextStyle(fontSize: 11, color: CupertinoColors.systemGrey.resolveFrom(context))),
      ]));
    }).toList());
  }
}

class _MonthlyBarChart extends StatelessWidget {
  final List<MonthlyCount> data;
  final Color color;

  const _MonthlyBarChart(this.data, this.color);

  @override
  Widget build(BuildContext context) {
    // 最多展示最近 12 个月，避免柱过密
    final shown = data.length > 12 ? data.sublist(data.length - 12) : data;
    final maxCount = shown.map((e) => e.count).fold<int>(1, (a, b) => a > b ? a : b);

    final bars = shown.asMap().entries.map((entry) {
      final i = entry.key;
      final m = entry.value;
      return BarChartGroupData(x: i, barRods: [
        BarChartRodData(
          toY: m.count.toDouble(),
          color: color,
          width: 12,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
        ),
      ], showingTooltipIndicators: []);
    }).toList();

    return BarChart(BarChartData(
      maxY: maxCount.toDouble(),
      barGroups: bars,
      gridData: const FlGridData(show: false),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 24,
          getTitlesWidget: (value, meta) {
            final idx = value.toInt();
            if (idx < 0 || idx >= shown.length) return const SizedBox.shrink();
            final month = shown[idx].month;
            // "2026-07" → "7月" / "Jul"
            final label = month.length >= 7
                ? '${int.parse(month.substring(5, 7))}'
                : month;
            return Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(label, style: const TextStyle(fontSize: 10)),
            );
          },
        )),
      ),
    ));
  }
}
