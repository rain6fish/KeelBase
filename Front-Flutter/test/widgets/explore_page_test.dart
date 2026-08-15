import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/explore/presentation/pages/explore_page.dart';
import '../helpers.dart';

void main() {
  testWidgets('渲染探索页：搜索入口 + 各功能入口', (tester) async {
    await tester.pumpWidget(wrapCupertinoPage(const ExplorePage()));

    expect(find.text('发现'), findsOneWidget);
    expect(find.byType(CupertinoListTile), findsWidgets);
    expect(find.text('通知'), findsOneWidget);
    expect(find.text('事件'), findsOneWidget);
    expect(find.text('待办'), findsOneWidget);
    expect(find.text('上传文件'), findsOneWidget);
    expect(find.text('设置'), findsOneWidget);
  });
}
