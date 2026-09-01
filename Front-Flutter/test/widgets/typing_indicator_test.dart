// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/ai/presentation/widgets/typing_indicator.dart';
import '../helpers.dart';

void main() {
  testWidgets('渲染三点输入指示器', (tester) async {
    await tester.pumpWidget(wrapCupertinoPage(const TypingIndicator()));
    // 重复动画：只固定推进，不使用 pumpAndSettle
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(TypingIndicator), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
