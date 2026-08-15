import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/auth/data/models/user_model.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import 'package:front_app/features/profile/presentation/pages/profile_page.dart';
import '../helpers.dart';

class MockAuthProvider extends Mock implements AuthProvider {}

void main() {
  final testUser = UserModel(
    id: 1,
    username: 'alex',
    email: 'alex@example.com',
    nickname: 'Alex',
    phone: '13800000000',
    bio: '热爱生活',
    createdAt: '2026-01-01T00:00:00.000Z',
  );

  testWidgets('渲染用户资料（昵称/邮箱/手机/简介）', (tester) async {
    final auth = MockAuthProvider();
    when(() => auth.user).thenReturn(testUser);

    await tester.pumpWidget(wrapCupertinoPage(
      const ProfilePage(),
      providers: [ChangeNotifierProvider<AuthProvider>.value(value: auth)],
    ));
    await tester.pump();

    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('@alex'), findsOneWidget);
    expect(find.text('alex@example.com'), findsOneWidget);
    expect(find.text('13800000000'), findsOneWidget);
    expect(find.text('热爱生活'), findsOneWidget);
  });

  testWidgets('未登录时渲染占位头像', (tester) async {
    final auth = MockAuthProvider();
    when(() => auth.user).thenReturn(null);

    await tester.pumpWidget(wrapCupertinoPage(
      const ProfilePage(),
      providers: [ChangeNotifierProvider<AuthProvider>.value(value: auth)],
    ));
    await tester.pump();

    expect(find.text('U'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
