import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/i18n/app_localizations.dart';
import 'core/router/app_router.dart';
import 'core/services/locale_provider.dart';
import 'core/services/theme_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/providers/auth_provider.dart';
import 'features/onboarding/presentation/providers/onboarding_provider.dart';
import 'core/services/push_token_provider.dart';

class App extends StatefulWidget {
  const App({super.key});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  GoRouter? _router;
  AuthProvider? _lastAuth;
  OnboardingProvider? _lastOnboarding;
  bool? _lastAuthenticated;

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();
    final authProvider = context.watch<AuthProvider>();
    final localeProvider = context.watch<LocaleProvider>();
    final onboardingProvider = context.watch<OnboardingProvider>();

    // Memoize router: only recreate when auth/onboarding provider reference changes,
    // not on every build (which would reset navigation state).
    if (_router == null ||
        authProvider != _lastAuth ||
        onboardingProvider != _lastOnboarding) {
      _router = createRouter(authProvider, onboardingProvider);
      _lastAuth = authProvider;
      _lastOnboarding = onboardingProvider;
    }

    // GROWTH-1 推送：登录态变化时注册/注销设备 token（Noop 未接厂商时跳过）
    final isAuthenticated = authProvider.isAuthenticated;
    if (isAuthenticated != _lastAuthenticated) {
      _lastAuthenticated = isAuthenticated;
      final pushToken = context.read<PushTokenProvider>();
      if (isAuthenticated) {
        pushToken.registerDevice();
      } else {
        pushToken.unregister();
      }
    }

    final isDark = themeProvider.themeMode == AppThemeMode.dark ||
        (themeProvider.themeMode == AppThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    return CupertinoApp.router(
      title: 'KeelBase',
      debugShowCheckedModeBanner: false,
      theme: isDark ? AppTheme.darkTheme : AppTheme.lightTheme,
      routerConfig: _router!,
      locale: localeProvider.locale,
      supportedLocales: const [
        Locale('en', 'US'),
        Locale('zh', 'CN'),
      ],
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
