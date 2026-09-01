// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/auth/data/models/user_model.dart';
import 'package:front_app/features/profile/presentation/pages/profile_edit_page.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import 'package:front_app/features/upload/presentation/providers/upload_provider.dart';
import '../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late MockAuthRepository authRepository;
  late MockSplashRepository splashRepository;
  late MockUploadRepository uploadRepository;
  late AuthProvider authProvider;
  late GoRouter router;

  final testUser = UserModel(
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    nickname: 'Tester',
    phone: '13800138000',
    bio: '你好',
  );

  setUp(() {
    apiClient = MockApiClient();
    authRepository = MockAuthRepository();
    splashRepository = MockSplashRepository();
    uploadRepository = MockUploadRepository();
    authProvider = AuthProvider(
      authRepository: authRepository,
      splashRepository: splashRepository,
      apiClient: apiClient,
    );
    authProvider.updateUser(testUser);
  });

  tearDown(() {
    authProvider.dispose();
  });

  Widget wrap() {
    router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(path: '/home', builder: (_, __) => const SizedBox.shrink()),
        GoRoute(path: '/profile', builder: (_, __) => const SizedBox.shrink()),
        GoRoute(
          path: '/profile/edit',
          builder: (_, __) => const ProfileEditPage(),
        ),
      ],
    );
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
        ChangeNotifierProvider<UploadProvider>(
          create: (_) => UploadProvider(uploadRepository),
        ),
        Provider<ApiClient>.value(value: apiClient),
      ],
      child: CupertinoApp.router(
        routerConfig: router,
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
      ),
    );
  }

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pumpAndSettle();
    router.push('/profile/edit');
    await tester.pumpAndSettle();
  }

  testWidgets('渲染编辑信息表单并回显用户数据', (tester) async {
    await pumpPage(tester);

    expect(find.text('编辑信息'), findsOneWidget);
    expect(find.text('@testuser'), findsOneWidget);
    expect(find.text('test@example.com'), findsOneWidget); // 邮箱回显
    expect(find.text('Tester'), findsOneWidget); // 昵称回显
    expect(find.text('13800138000'), findsOneWidget); // 手机号回显
    expect(find.text('用户名'), findsOneWidget);
    expect(find.text('保存'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('昵称为空时点保存 → 提示且不调用接口', (tester) async {
    await pumpPage(tester);

    // 清空昵称输入框（email/firstName/lastName 之后是 nickname）
    await tester.enterText(find.byType(CupertinoTextField).at(3), '');
    await tester.pump();

    await tester.tap(find.text('保存'));
    await tester.pump();

    expect(find.text('请输入昵称'), findsOneWidget);
    verifyNever(() => apiClient.put(any(), data: any(named: 'data')));
    // flush toast timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('修改昵称后点保存 → 调用接口并提示成功', (tester) async {
    when(() => apiClient.put('/users/1', data: any(named: 'data')))
        .thenAnswer((_) async => {
              'code': 200,
              'message': 'ok',
              'timestamp': '2026-08-19T00:00:00Z',
              'data': testUser.toJson(),
            });

    await pumpPage(tester);

    await tester.enterText(find.byType(CupertinoTextField).at(3), '新昵称');
    await tester.pump();

    await tester.tap(find.text('保存'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    verify(() => apiClient.put('/users/1', data: any(named: 'data'))).called(1);
    expect(find.text('保存'), findsWidgets); // 成功 toast
    // flush toast timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
