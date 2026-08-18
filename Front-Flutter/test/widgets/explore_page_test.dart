import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/capabilities_provider.dart';
import 'package:front_app/core/api/capabilities_repository.dart';
import 'package:front_app/features/explore/presentation/pages/explore_page.dart';
import '../helpers.dart';

void main() {
  testWidgets('渲染探索页：搜索入口 + 各功能入口', (tester) async {
    await tester.pumpWidget(
      wrapCupertinoPage(
        const ExplorePage(),
        providers: [
          // MOD-4：探索页 build 时 context.watch<CapabilitiesProvider>() 决定搜索入口显隐
          ChangeNotifierProvider<CapabilitiesProvider>(
            create: (_) => CapabilitiesProvider(CapabilitiesRepository(MockApiClient())),
          ),
        ],
      ),
    );

    expect(find.text('发现'), findsOneWidget);
    expect(find.byType(CupertinoListTile), findsWidgets);
    expect(find.text('通知'), findsOneWidget);
    expect(find.text('事件'), findsOneWidget);
    expect(find.text('待办'), findsOneWidget);
    expect(find.text('上传文件'), findsOneWidget);
    expect(find.text('设置'), findsOneWidget);
  });
}
