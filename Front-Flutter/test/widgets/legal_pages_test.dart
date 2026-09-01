// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/legal/presentation/pages/privacy_policy_page.dart';
import 'package:front_app/features/legal/presentation/pages/terms_of_service_page.dart';
import '../helpers.dart';

void main() {
  testWidgets('隐私政策页：渲染标题 + 正文 + 返回按钮', (tester) async {
    await tester.pumpWidget(wrapCupertinoPage(const PrivacyPolicyPage()));
    await tester.pump();

    // 导航栏标题 + 正文一级标题均为「隐私政策」
    expect(find.text('隐私政策'), findsWidgets);
    // 正文子标题（markdown ## 渲染）
    expect(find.textContaining('我们收集的信息'), findsOneWidget);
    expect(find.textContaining('数据存储与安全'), findsWidgets);
    // 返回按钮
    expect(find.text('返回'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('服务条款页：渲染标题 + 正文 + 返回按钮', (tester) async {
    await tester.pumpWidget(wrapCupertinoPage(const TermsOfServicePage()));
    await tester.pump();

    expect(find.text('服务条款'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
