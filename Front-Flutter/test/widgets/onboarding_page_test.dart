import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/onboarding/presentation/pages/onboarding_page.dart';
import 'package:front_app/features/onboarding/presentation/providers/onboarding_provider.dart';
import '../helpers.dart';

void main() {
  Widget wrap() => wrapCupertinoPage(
        const OnboardingPage(),
        providers: [
          ChangeNotifierProvider<OnboardingProvider>(
            create: (_) => OnboardingProvider(null),
          ),
        ],
      );

  testWidgets('渲染第一页引导内容', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    expect(find.text('欢迎使用 KeelBase'), findsOneWidget);
    expect(find.text('跳过'), findsOneWidget);
    expect(find.text('下一步'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击下一步翻页到第二/三页', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    await tester.tap(find.text('下一步'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('事件与待办'), findsOneWidget);

    await tester.tap(find.text('下一步'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('AI 助手'), findsOneWidget);
    expect(find.text('开始使用'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
