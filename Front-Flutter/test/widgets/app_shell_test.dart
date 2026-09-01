// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/widgets/app_shell.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import '../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late MockAuthRepository authRepository;
  late MockSplashRepository splashRepository;
  late AuthProvider authProvider;
  late GoRouter router;

  setUp(() {
    apiClient = MockApiClient();
    authRepository = MockAuthRepository();
    splashRepository = MockSplashRepository();
    authProvider = AuthProvider(
      authRepository: authRepository,
      splashRepository: splashRepository,
      apiClient: apiClient,
    );
    when(() => authRepository.logout()).thenAnswer((_) async {});
    when(() => apiClient.clearTokens()).thenAnswer((_) async {});
  });

  tearDown(() {
    authProvider.dispose();
  });

  Widget wrap() {
    router = GoRouter(
      initialLocation: '/dashboard',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              AppShell(navigationShell: navigationShell),
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/dashboard',
                  builder: (_, __) => const Text('DASH_PAGE'),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/events',
                  builder: (_, __) => const Text('EVENTS_PAGE'),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/explore',
                  builder: (_, __) => const Text('EXPLORE_PAGE'),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/ai',
                  builder: (_, __) => const Text('AI_PAGE'),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/todos',
                  builder: (_, __) => const Text('TODOS_PAGE'),
                ),
              ],
            ),
          ],
        ),
        GoRoute(
          path: '/events/create',
          builder: (_, __) => const Text('CREATE_PAGE'),
        ),
        GoRoute(path: '/profile', builder: (_, __) => const Text('PROFILE_PAGE')),
        GoRoute(
          path: '/profile/edit',
          builder: (_, __) => const Text('EDIT_PROFILE_PAGE'),
        ),
        GoRoute(
          path: '/settings',
          builder: (_, __) => const Text('SETTINGS_PAGE'),
        ),
        GoRoute(path: '/privacy', builder: (_, __) => const Text('PRIVACY_PAGE')),
        GoRoute(path: '/terms', builder: (_, __) => const Text('TERMS_PAGE')),
      ],
    );
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
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

  Future<void> pumpShell(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    await tester.pumpAndSettle();
  }

  testWidgets('渲染 6 个底部 Tab', (tester) async {
    await pumpShell(tester);

    expect(find.text('DASH_PAGE'), findsOneWidget);
    expect(find.text('首页'), findsOneWidget);
    expect(find.text('事件'), findsOneWidget);
    expect(find.text('更多'), findsOneWidget);
    expect(find.text('发现'), findsOneWidget);
    expect(find.text('AI'), findsOneWidget);
    expect(find.text('待办'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击 Tab 切换分支', (tester) async {
    await pumpShell(tester);

    await tester.tap(find.text('事件'));
    await tester.pumpAndSettle();
    expect(find.text('EVENTS_PAGE'), findsOneWidget);

    await tester.tap(find.text('AI'));
    await tester.pumpAndSettle();
    expect(find.text('AI_PAGE'), findsOneWidget);

    await tester.tap(find.text('待办'));
    await tester.pumpAndSettle();
    expect(find.text('TODOS_PAGE'), findsOneWidget);
  });

  testWidgets('点击「更多」打开菜单并渲染全部入口', (tester) async {
    await pumpShell(tester);

    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();

    expect(find.text('创建事件'), findsOneWidget);
    expect(find.text('个人资料'), findsOneWidget);
    expect(find.text('编辑信息'), findsOneWidget);
    expect(find.text('设置'), findsOneWidget);
    expect(find.text('上传文件'), findsOneWidget);
    expect(find.text('隐私政策'), findsOneWidget);
    expect(find.text('服务条款'), findsOneWidget);
    expect(find.text('关于'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击菜单「设置」跳转对应路由', (tester) async {
    await pumpShell(tester);

    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();

    expect(find.text('SETTINGS_PAGE'), findsOneWidget);
  });

  testWidgets('点击「关于」关闭弹层', (tester) async {
    await pumpShell(tester);

    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('关于'));
    await tester.pumpAndSettle();

    expect(find.text('创建事件'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('点击「退出登录」弹确认框，取消不登出', (tester) async {
    await pumpShell(tester);

    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('退出登录'));
    await tester.pumpAndSettle();

    expect(find.text('确定要退出登录吗？'), findsOneWidget);

    await tester.tap(find.widgetWithText(CupertinoDialogAction, '取消'));
    await tester.pumpAndSettle();

    verifyNever(() => authRepository.logout());
    // 弹层仍可关闭
    await tester.tap(find.text('关于'));
    await tester.pumpAndSettle();
    expect(find.text('创建事件'), findsNothing);
  });
}
