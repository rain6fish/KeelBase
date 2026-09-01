// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/features/feedback/presentation/pages/feedback_page.dart';
import '../helpers.dart';

void main() {
  late MockApiClient apiClient;

  setUp(() {
    apiClient = MockApiClient();
  });

  Widget wrap() => wrapPushableCupertinoPage(
        const FeedbackPage(),
        providers: [
          Provider<ApiClient>.value(value: apiClient),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染反馈表单', (tester) async {
    await pumpPage(tester);

    expect(find.text('意见反馈'), findsOneWidget);
    expect(find.text('反馈类型'), findsOneWidget);
    expect(find.text('建议'), findsOneWidget);
    expect(find.text('问题'), findsOneWidget);
    expect(find.text('好评'), findsOneWidget);
    expect(find.text('提交'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('内容为空提交提示必填', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.text('提交'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('请填写反馈内容'), findsOneWidget);
    verifyNever(() => apiClient.post('/feedback', data: any(named: 'data')));

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('提交失败显示错误 toast', (tester) async {
    when(() => apiClient.post('/feedback', data: any(named: 'data')))
        .thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    await tester.enterText(find.byType(CupertinoTextField).first, '建议增加导出功能');
    await tester.pump();
    await tester.tap(find.text('提交'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => apiClient.post('/feedback', data: any(named: 'data'))).called(1);
    expect(find.text('提交失败，请重试'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
