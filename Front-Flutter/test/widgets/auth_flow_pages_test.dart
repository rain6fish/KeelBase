import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/widgets/app_primary_button.dart';
import 'package:front_app/features/auth/presentation/pages/bind_phone_page.dart';
import 'package:front_app/features/auth/presentation/pages/forgot_password_page.dart';
import 'package:front_app/features/auth/presentation/pages/reset_password_page.dart';
import 'package:front_app/features/auth/presentation/pages/verify_email_page.dart';
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
    when(() => apiClient.clearTokens()).thenAnswer((_) async {});
  });

  tearDown(() {
    authProvider.dispose();
  });

  Widget wrapAuth({required String path, required Widget page}) {
    router = GoRouter(
      initialLocation: path,
      routes: [
        GoRoute(path: path, builder: (_, __) => page),
        GoRoute(path: '/login', builder: (_, __) => const Text('LOGIN_PAGE')),
        GoRoute(path: '/profile', builder: (_, __) => const SizedBox.shrink()),
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

  // ═══════════════════ 忘记密码 ═══════════════════

  group('忘记密码页', () {
    Future<void> pumpPage(WidgetTester tester) async {
      await tester.pumpWidget(
        wrapAuth(path: '/forgot', page: const ForgotPasswordPage()),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('渲染邮箱输入与发送按钮', (tester) async {
      await pumpPage(tester);

      expect(find.text('忘记密码？'), findsWidgets); // 导航栏 + 标题
      expect(find.text('至少 8 位，包含字母和数字'), findsOneWidget);
      expect(find.byType(CupertinoTextField), findsOneWidget);
      expect(find.text('发送重置链接'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('邮箱为空 → 提示且不调用接口', (tester) async {
      await pumpPage(tester);

      await tester.tap(find.text('发送重置链接'));
      await tester.pump();

      expect(find.text('请输入邮箱'), findsOneWidget);
      verifyNever(() => authRepository.requestPasswordReset(any()));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('邮箱格式错误 → 提示', (tester) async {
      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField), 'abc');
      await tester.pump();
      await tester.tap(find.text('发送重置链接'));
      await tester.pump();

      expect(find.text('邮箱格式不正确'), findsOneWidget);
      verifyNever(() => authRepository.requestPasswordReset(any()));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('提交成功 → 显示已发送状态', (tester) async {
      when(() => authRepository.requestPasswordReset('test@example.com'))
          .thenAnswer((_) async {});

      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField), 'test@example.com');
      await tester.pump();
      await tester.tap(find.text('发送重置链接'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      verify(() => authRepository.requestPasswordReset('test@example.com')).called(1);
      expect(find.text('如果该邮箱已注册，重置链接已发送。'), findsOneWidget);
    });
  });

  // ═══════════════════ 重置密码 ═══════════════════

  group('重置密码页', () {
    Future<void> pumpPage(WidgetTester tester) async {
      await tester.pumpWidget(
        wrapAuth(path: '/reset', page: const ResetPasswordPage(token: 'tok123')),
      );
      await tester.pumpAndSettle();
    }

    Future<void> tapSubmit(WidgetTester tester) async {
      await tester.ensureVisible(find.byType(AppPrimaryButton));
      await tester.pump();
      await tester.tap(find.byType(AppPrimaryButton));
    }

    testWidgets('渲染新密码/确认密码输入', (tester) async {
      await pumpPage(tester);

      expect(find.text('重置密码'), findsWidgets); // 导航栏 + 标题 + 按钮
      expect(find.byType(CupertinoTextField), findsNWidgets(2));
      expect(find.text('新密码'), findsOneWidget);
      expect(find.text('确认密码'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('密码不足 8 位 → 提示', (tester) async {
      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField).at(0), 'abc');
      await tester.pump();
      await tapSubmit(tester);
      await tester.pump();

      expect(find.text('至少 8 位，包含字母和数字'), findsWidgets);
      verifyNever(() => authRepository.resetPassword(any(), any()));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('两次密码不一致 → 提示', (tester) async {
      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField).at(0), 'password123');
      await tester.enterText(find.byType(CupertinoTextField).at(1), 'different');
      await tester.pump();
      await tapSubmit(tester);
      await tester.pump();

      expect(find.text('两次输入的密码不一致'), findsOneWidget);
      verifyNever(() => authRepository.resetPassword(any(), any()));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('提交有效密码 → 调用接口并跳转登录', (tester) async {
      when(() => authRepository.resetPassword('tok123', 'newpass123'))
          .thenAnswer((_) async {});

      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField).at(0), 'newpass123');
      await tester.enterText(find.byType(CupertinoTextField).at(1), 'newpass123');
      await tester.pump();
      await tapSubmit(tester);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();

      verify(() => authRepository.resetPassword('tok123', 'newpass123')).called(1);
      expect(find.text('密码已重置，请登录。'), findsOneWidget);
      expect(find.text('LOGIN_PAGE'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });
  });

  // ═══════════════════ 邮箱验证 ═══════════════════

  group('验证邮箱页', () {
    Future<void> pumpPage(WidgetTester tester) async {
      await tester.pumpWidget(
        wrapAuth(
          path: '/verify-email',
          page: const VerifyEmailPage(email: 'test@example.com'),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('渲染验证码输入与重新发送', (tester) async {
      await pumpPage(tester);

      expect(find.text('验证邮箱'), findsWidgets); // 导航栏 + 标题 + 按钮
      expect(find.textContaining('test@example.com'), findsOneWidget);
      expect(find.byType(CupertinoTextField), findsOneWidget);
      expect(find.text('重新发送'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('验证码位数不对 → 提示', (tester) async {
      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField), '123');
      await tester.pump();
      await tester.tap(find.byType(AppPrimaryButton));
      await tester.pump();

      expect(find.text('输入 6 位验证码'), findsWidgets);
      verifyNever(() => authRepository.verifyEmail(any(), any()));
    });

    testWidgets('提交有效验证码 → 调用接口并跳转登录', (tester) async {
      when(() => authRepository.verifyEmail('test@example.com', '123456'))
          .thenAnswer((_) async {});

      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField), '123456');
      await tester.pump();
      await tester.tap(find.byType(AppPrimaryButton));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();

      verify(() => authRepository.verifyEmail('test@example.com', '123456')).called(1);
      expect(find.text('邮箱验证成功'), findsOneWidget);
      expect(find.text('LOGIN_PAGE'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('点重新发送 → 调用 resendVerification', (tester) async {
      when(() => authRepository.resendVerification('test@example.com'))
          .thenAnswer((_) async {});

      await pumpPage(tester);

      await tester.tap(find.text('重新发送'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      verify(() => authRepository.resendVerification('test@example.com')).called(1);
      expect(find.text('验证码已发送到您的邮箱。'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });
  });

  // ═══════════════════ 绑定手机号 ═══════════════════

  group('绑定手机号页', () {
    Future<void> pumpPage(WidgetTester tester) async {
      await tester.pumpWidget(
        wrapAuth(path: '/bind-phone', page: const BindPhonePage()),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('渲染手机号/验证码输入', (tester) async {
      await pumpPage(tester);

      expect(find.text('绑定手机号'), findsWidgets); // 导航栏 + 按钮
      expect(find.byType(CupertinoTextField), findsNWidgets(2));
      expect(find.text('获取验证码'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('手机号为空点获取验证码 → 提示', (tester) async {
      await pumpPage(tester);

      await tester.tap(find.text('获取验证码'));
      await tester.pump();

      expect(find.text('请先输入手机号'), findsOneWidget);
      verifyNever(() => authRepository.sendSmsCode(any()));
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('绑定成功 → 调用 bindPhone', (tester) async {
      when(() => authRepository.bindPhone('13800138000', '123456'))
          .thenAnswer((_) async {});

      await pumpPage(tester);

      await tester.enterText(find.byType(CupertinoTextField).at(0), '13800138000');
      await tester.enterText(find.byType(CupertinoTextField).at(1), '123456');
      await tester.pump();
      final bindBtn = find.widgetWithText(CupertinoButton, '绑定手机号');
      await tester.ensureVisible(bindBtn);
      await tester.pump();
      await tester.tap(bindBtn);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      verify(() => authRepository.bindPhone('13800138000', '123456')).called(1);
      expect(find.text('手机号已绑定'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 500));
    });
  });
}
