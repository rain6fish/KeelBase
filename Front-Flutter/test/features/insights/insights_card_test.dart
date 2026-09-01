// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/insights/data/models/insights_model.dart';
import 'package:front_app/features/insights/presentation/widgets/insights_card.dart';
import '../../helpers.dart';

void main() {
  Widget wrap(Widget child) => wrapCupertinoPage(child);

  InsightsModel data() => InsightsModel(
        totalEvents: 10,
        activeEvents: 5,
        cancelledEvents: 2,
        recentEvents: 3,
        monthlyBreakdown: [
          MonthlyCount(month: '2026-07', count: 4),
          MonthlyCount(month: '2026-08', count: 6),
        ],
        summary: '本月事件数较上月增长 50%',
      );

  testWidgets('加载态显示指示器', (tester) async {
    await tester.pumpWidget(wrap(const InsightsCard(loading: true)));
    await tester.pump();

    expect(find.byType(CupertinoActivityIndicator), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('错误态显示错误与重试按钮', (tester) async {
    var retried = false;
    await tester.pumpWidget(wrap(InsightsCard(
      loading: false,
      error: '加载失败',
      onRetry: () => retried = true,
    )));
    await tester.pump();

    expect(find.text('数据洞察加载失败'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await tester.pump();
    expect(retried, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('无数据时显示空态', (tester) async {
    await tester.pumpWidget(wrap(const InsightsCard(loading: false)));
    await tester.pump();

    expect(find.text('创建事件后可查看你的数据洞察'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('有数据时渲染统计与图表', (tester) async {
    await tester.pumpWidget(wrap(InsightsCard(loading: false, insights: data())));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('数据洞察'), findsOneWidget);
    expect(find.text('全部'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.text('已取消'), findsOneWidget);
    expect(find.text('近30天'), findsOneWidget);
    expect(find.text('每月事件分布'), findsOneWidget);
    expect(find.text('本月事件数较上月增长 50%'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
