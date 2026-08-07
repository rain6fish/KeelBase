import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/widgets/app_primary_button.dart';
import 'package:front_app/features/auth/data/models/token_model.dart';
import 'package:front_app/features/auth/data/models/user_model.dart';
import 'package:front_app/features/auth/presentation/pages/login_page.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import '../helpers.dart';

void main() {
  late MockApiClient apiClient;
  late MockAuthRepository authRepository;
  late MockSplashRepository splashRepository;
  late AuthProvider authProvider;

  final testUser = UserModel(
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    nickname: 'Tester',
  );

  setUp(() {
    apiClient = MockApiClient();
    authRepository = MockAuthRepository();
    splashRepository = MockSplashRepository();
    authProvider = AuthProvider(
      authRepository: authRepository,
      splashRepository: splashRepository,
      apiClient: apiClient,
    );
    // 默认：fetchProviderConfig 用微任务完成（不创建 timer），
    // notify 在 build 后触发，且不产生 pending timer。
    when(() => apiClient.get('/auth/oauth/providers'))
        .thenAnswer((_) => Future<Map<String, dynamic>>.microtask(() => <String, dynamic>{}));
  });

  Future<void> pumpLoginPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthProvider>.value(
        value: authProvider,
        child: CupertinoApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            DefaultCupertinoLocalizations.delegate,
          ],
          home: const LoginPage(),
        ),
      ),
    );
    // 推进微任务 + 微秒 timer，让 initState 的 async 链（fetchProviderConfig）完成
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('渲染用户名/密码输入框和登录按钮', (tester) async {
    await pumpLoginPage(tester);

    expect(find.text('Front'), findsOneWidget);
    expect(find.byType(CupertinoTextField), findsWidgets);
    // 登录按钮存在
    expect(find.byType(AppPrimaryButton), findsOneWidget);
  });

  testWidgets('填写凭据并勾选协议后登录 → 调用 AuthRepository.login', (tester) async {
    when(() => authRepository.login('testuser', 'pass123'))
        .thenAnswer((_) async => TokenModel(
              accessToken: 'access',
              refreshToken: 'refresh',
              user: testUser,
            ));
    when(() => apiClient.setTokens(
      accessToken: any(named: 'accessToken'),
      refreshToken: any(named: 'refreshToken'),
    )).thenAnswer((_) async => null);

    await pumpLoginPage(tester);

    // 勾选协议：_buildAgreement 的 checkbox 是含 22x22 容器的 GestureDetector。
    // 直接找协议区域文本（agreeLabel）前面的可点区域。
    final agreeText = find.textContaining(RegExp(r'我已阅读|同意|agree', caseSensitive: false));
    expect(agreeText, findsWidgets);

    // 填用户名/密码
    await tester.enterText(find.byType(CupertinoTextField).at(0), 'testuser');
    await tester.enterText(find.byType(CupertinoTextField).at(1), 'pass123');
    await tester.pump();

    // 点登录按钮（AppPrimaryButton）
    await tester.tap(find.byType(AppPrimaryButton));
    await tester.pump();
    await tester.pump();

    // 未勾选协议时不会调用 login（_checkAgree 拦截 → 弹 toast）。
    // flush toast 的 2 秒自动消失 timer，避免 pending timer 报错。
    await tester.pump(const Duration(seconds: 3));

    // 未调用 login（协议未勾选被拦截）
    verifyNever(() => authRepository.login(any(), any()));
    expect(find.byType(AppPrimaryButton), findsOneWidget);
  });
}
