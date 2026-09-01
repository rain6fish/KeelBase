// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/auth/presentation/pages/register_page.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import '../helpers.dart';

class MockAuthProvider extends Mock implements AuthProvider {}

void main() {
  Widget wrap(MockAuthProvider auth) => wrapCupertinoPage(
        const RegisterPage(),
        providers: [ChangeNotifierProvider<AuthProvider>.value(value: auth)],
      );

  testWidgets('渲染注册页表单字段', (tester) async {
    final auth = MockAuthProvider();
    when(() => auth.status).thenReturn(AuthStatus.unauthenticated);
    when(() => auth.error).thenReturn(null);

    await tester.pumpWidget(wrap(auth));
    await tester.pump();

    expect(find.text('注册'), findsWidgets);
    expect(find.byType(CupertinoTextField), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
