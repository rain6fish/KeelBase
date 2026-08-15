import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:front_app/app.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/core/security/secure_storage_service.dart';
import 'package:front_app/core/services/app_lock_provider.dart';
import 'package:front_app/core/services/locale_provider.dart';
import 'package:front_app/core/services/push_service.dart';
import 'package:front_app/core/services/push_token_provider.dart';
import 'package:front_app/core/services/theme_provider.dart';
import 'package:front_app/features/auth/data/repositories/auth_repository.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import 'package:front_app/features/events/data/repositories/events_repository.dart';
import 'package:front_app/features/events/presentation/providers/events_provider.dart';
import 'package:front_app/features/splash/data/repositories/splash_repository.dart';
import 'package:front_app/features/upload/data/repositories/upload_repository.dart';
import 'package:front_app/features/upload/presentation/providers/upload_provider.dart';
import 'package:front_app/features/version/presentation/providers/version_check_provider.dart';
import 'package:front_app/features/onboarding/presentation/providers/onboarding_provider.dart';
import 'helpers.dart';

void main() {
  testWidgets('App renders splash page', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final secureStorage = SecureStorageService();
    final apiClient = ApiClient(secureStorage);

    final authRepository = AuthRepository(apiClient);
    final splashRepository = SplashRepository(apiClient);
    final eventsRepository = EventsRepository(apiClient);
    final uploadRepository = UploadRepository(apiClient);
    // Mock 版本检查：立即失败降级为「无更新」，避免真实 HTTP 产生的 pending timer
    final versionRepository = MockVersionRepository();
    when(() => versionRepository.getVersionInfo()).thenThrow(Exception('offline'));

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<SecureStorageService>.value(value: secureStorage),
          Provider<SharedPreferences>.value(value: prefs),
          Provider<ApiClient>.value(value: apiClient),
          ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider(prefs)),
          ChangeNotifierProvider<LocaleProvider>(create: (_) => LocaleProvider(prefs)),
          ChangeNotifierProvider<AuthProvider>(
            create: (_) => AuthProvider(
              authRepository: authRepository,
              splashRepository: splashRepository,
              apiClient: apiClient,
            ),
          ),
          ChangeNotifierProvider<EventsProvider>(
            create: (_) => EventsProvider(eventsRepository),
          ),
          ChangeNotifierProvider<UploadProvider>(
            create: (_) => UploadProvider(uploadRepository),
          ),
          ChangeNotifierProvider<VersionCheckProvider>(
            create: (_) => VersionCheckProvider(versionRepository),
          ),
          ChangeNotifierProvider<OnboardingProvider>(
            create: (_) => OnboardingProvider(prefs),
          ),
          ChangeNotifierProvider<AppLockProvider>(
            create: (_) => AppLockProvider(prefs),
          ),
          Provider<PushService>(
            create: (_) => NoopPushService(),
          ),
          ProxyProvider2<ApiClient, PushService, PushTokenProvider>(
            update: (_, api, push, __) => PushTokenProvider(api, push),
          ),
        ],
        child: const App(),
      ),
    );

    expect(find.text('KeelBase'), findsOneWidget);
  });
}
