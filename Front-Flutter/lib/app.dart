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

class App extends StatefulWidget {
  const App({super.key});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  GoRouter? _router;
  AuthProvider? _lastAuth;
  OnboardingProvider? _lastOnboarding;

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

    final isDark = themeProvider.themeMode == AppThemeMode.dark ||
        (themeProvider.themeMode == AppThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    return CupertinoApp.router(
      title: 'Front',
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
