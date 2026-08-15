import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async' show TimeoutException;
import 'core/constants/app_constants.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/sse_client.dart';
import 'core/security/secure_storage_service.dart';
import 'core/services/locale_provider.dart';
import 'core/services/theme_provider.dart';
import 'core/services/push_service.dart';
import 'core/services/push_token_provider.dart';
import 'features/auth/data/repositories/auth_repository.dart';
import 'features/auth/presentation/providers/auth_provider.dart';
import 'features/events/data/repositories/events_repository.dart';
import 'features/events/presentation/providers/events_provider.dart';
import 'features/splash/data/repositories/splash_repository.dart';
import 'features/upload/data/repositories/upload_repository.dart';
import 'features/notifications/data/repositories/notifications_repository.dart';
import 'features/notifications/presentation/providers/notifications_provider.dart';
import 'features/ai/presentation/providers/ai_chat_provider.dart';
import 'features/ai/presentation/providers/conversation_provider.dart';
import 'features/ai/data/repositories/ai_conversation_repository.dart';
import 'features/sessions/data/repositories/session_repository.dart';
import 'features/sessions/presentation/providers/session_provider.dart';
import 'features/todos/data/repositories/todos_repository.dart';
import 'features/tags/data/repositories/tags_repository.dart';
import 'features/tags/presentation/providers/tags_provider.dart';
import 'features/flows/data/repositories/flows_repository.dart';
import 'features/flows/presentation/providers/flows_provider.dart';

import 'features/notes/data/repositories/notes_repository.dart';
import 'features/notes/presentation/providers/notes_provider.dart';

import 'features/books/data/repositories/books_repository.dart';
import 'features/books/presentation/providers/books_provider.dart';
import 'features/posts/data/repositories/posts_repository.dart';
import 'features/posts/presentation/providers/posts_provider.dart';
import 'features/org/data/repositories/org_repository.dart';
import 'features/org/presentation/providers/org_provider.dart';
import 'features/points/data/repositories/points_repository.dart';
import 'features/points/presentation/providers/points_provider.dart';

import 'features/todos/presentation/providers/todos_provider.dart';
import 'features/search/data/repositories/search_repository.dart';
import 'features/search/presentation/providers/search_provider.dart';
import 'features/upload/presentation/providers/upload_provider.dart';
import 'features/version/data/repositories/version_repository.dart';
import 'features/insights/data/repositories/insights_repository.dart';
import 'features/insights/presentation/providers/insights_provider.dart';
import 'features/announcements/presentation/providers/announcement_provider.dart';
import 'features/onboarding/presentation/providers/onboarding_provider.dart';
import 'core/services/app_cache.dart';
import 'core/services/app_lock_provider.dart';
import 'features/version/presentation/providers/version_check_provider.dart';
import 'features/auth/data/services/oauth_service.dart';

void main() async {
  // Timeout fallback: if init takes >15s, show error UI
  try {
    await _initApp().timeout(const Duration(seconds: 15));
  } on TimeoutException {
    FlutterError.reportError(FlutterErrorDetails(
      exception: Exception('App initialization timed out'),
      stack: StackTrace.current,
    ));
    runApp(_ErrorApp('App initialization timed out. Please refresh.'));
  } catch (e, stack) {
    // eslint-disable-next-line no-console
    print('FATAL: App initialization failed: $e\n$stack');
    // Re-throw so the browser console shows the full error
    runApp(_ErrorApp('$e'));
  }
}

Future<void> _initApp() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Core services
  SharedPreferences? prefs;
  try {
    prefs = await SharedPreferences.getInstance();
  } catch (_) {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  }
  // Ensure prefs is non-null (second catch fallback)
  prefs ??= await SharedPreferences.getInstance();
  // UX-2 Dev Menu 环境切换：读 dev_base_url 覆盖默认 API 地址（重启生效）
  final devBaseUrl = prefs.getString(AppConstants.keyDevBaseUrl);
  if (devBaseUrl != null && devBaseUrl.isNotEmpty) {
    AppConstants.activeBaseUrl = devBaseUrl;
  }
  final secureStorage = SecureStorageService();  // Falls back to in-memory on web
  final apiClient = ApiClient(secureStorage);

  // Initialize device ID for rate limiting
  apiClient.deviceId = await secureStorage.getOrCreateDeviceId();

  // Repositories
  final authRepository = AuthRepository(apiClient);
  final splashRepository = SplashRepository(apiClient);
  final eventsRepository = EventsRepository(apiClient);
  final uploadRepository = UploadRepository(apiClient);
  final notificationsRepository = NotificationsRepository(apiClient);
  final aiConversationRepository = AiConversationRepository(apiClient);

  // Auth failure handler — must be set before any API calls
  AuthProvider? authProvider;
  apiClient.onAuthFailure = () async {
    authProvider?.logout();
  };

  // Initialize OAuth SDKs (WeChat / Alipay)
  // Replace app IDs with your actual credentials from the respective platforms.
  final oauthService = OAuthService();
  try {
    await oauthService.init(
      weChatAppId: 'wx000000000000000',          // ← 替换为微信开放平台 AppID
      weChatUniversalLink: null,                  // iOS Universal Link (可选)
    );
  } catch (_) {
    // OAuth init is non-critical — app can still start
  }

  // SSE client for AI streaming
  final sseClient = SseClient(getAccessToken: () => apiClient.accessToken ?? '');

  // Theme
  final themeProvider = ThemeProvider(prefs);

  runApp(
    MultiProvider(
      providers: [
        // Core services (accessible by all features)
        Provider<SecureStorageService>.value(value: secureStorage),
        Provider<SharedPreferences>.value(value: prefs),
        Provider<ApiClient>.value(value: apiClient),
        Provider<SseClient>.value(value: sseClient),
        Provider<AuthRepository>.value(value: authRepository),

        // GROWTH-1 推送：默认 Noop（未接厂商），真实 JPush/FCM 接入后替换实现
        Provider<PushService>(
          create: (_) => NoopPushService(),
        ),
        ProxyProvider2<ApiClient, PushService, PushTokenProvider>(
          update: (_, api, push, __) => PushTokenProvider(api, push),
        ),

        // Events
        Provider<EventsRepository>.value(value: eventsRepository),

        // Theme
        ChangeNotifierProvider<ThemeProvider>.value(value: themeProvider),

        // Locale
        ChangeNotifierProvider<LocaleProvider>(
          create: (_) => LocaleProvider(prefs!),
        ),

        // UX-4 应用锁（生物识别）
        ChangeNotifierProvider<AppLockProvider>(
          create: (_) => AppLockProvider(prefs!),
        ),

        // Auth
        ChangeNotifierProvider<AuthProvider>(
          create: (_) {
            final ap = AuthProvider(
              authRepository: authRepository,
              splashRepository: splashRepository,
              apiClient: apiClient,
              oauthService: oauthService,
            );
            authProvider = ap;
            return ap;
          },
        ),

        // Events
        ChangeNotifierProvider<EventsProvider>(
          create: (_) => EventsProvider(eventsRepository),
        ),

        // Notifications (UX-1 缓存优先)
        ChangeNotifierProvider<NotificationsProvider>(
          create: (_) => NotificationsProvider(
            notificationsRepository,
            sseClient: sseClient,
            cache: AppCache(prefs),
          ),
        ),

        // Upload
        ChangeNotifierProvider<UploadProvider>(
          create: (_) => UploadProvider(uploadRepository),
        ),

        // AI
        ChangeNotifierProvider<AiChatProvider>(
          create: (_) => AiChatProvider(apiClient, sseClient),
        ),
        ChangeNotifierProvider<ConversationProvider>(
          create: (_) => ConversationProvider(aiConversationRepository),
        ),

        // Sessions
        ChangeNotifierProvider<SessionProvider>(
          create: (_) => SessionProvider(SessionRepository(apiClient)),
        ),

        // Search (PL-4.1 搜索历史 + AI 对话 Tab)
        ChangeNotifierProvider<SearchProvider>(
          create: (_) => SearchProvider(
            SearchRepository(apiClient),
            prefs: prefs,
            conversationRepository: AiConversationRepository(apiClient),
          ),
        ),

        // Todos (UX-1 缓存优先 + 乐观更新)
        ChangeNotifierProvider<TodosProvider>(
          create: (_) => TodosProvider(TodosRepository(apiClient), cache: AppCache(prefs)),
        ),

        // FLOW-7 审批待办
        ChangeNotifierProvider<FlowsProvider>(
          create: (_) => FlowsProvider(FlowsRepository(apiClient)),
        ),
        // 标签（EASY-2 生成）
        ChangeNotifierProvider<TagsProvider>(
          create: (_) => TagsProvider(TagsRepository(apiClient), cache: AppCache(prefs)),
        ),
        // 笔记（EASY-2 生成）
        ChangeNotifierProvider<NotesProvider>(
          create: (_) => NotesProvider(NotesRepository(apiClient), cache: AppCache(prefs)),
        ),
        // 图书（EASY-2 生成）
        ChangeNotifierProvider<BooksProvider>(
          create: (_) => BooksProvider(BooksRepository(apiClient), cache: AppCache(prefs)),
        ),
        // 帖子（EASY-2 生成）
        ChangeNotifierProvider<PostsProvider>(
          create: (_) => PostsProvider(PostsRepository(apiClient), cache: AppCache(prefs)),
        ),

        // 我的组织（ORG-7，只读通讯录）
        ChangeNotifierProvider<OrgProvider>(
          create: (_) => OrgProvider(OrgRepository(apiClient)),
        ),

        // 积分 / 签到（GROWTH-3）
        ChangeNotifierProvider<PointsProvider>(
          create: (_) => PointsProvider(PointsRepository(apiClient)),
        ),

        // Version check
        ChangeNotifierProvider<VersionCheckProvider>(
          create: (_) => VersionCheckProvider(VersionRepository(apiClient)),
        ),

        // Insights (UX-5)
        ChangeNotifierProvider<InsightsProvider>(
          create: (_) => InsightsProvider(InsightsRepository(apiClient)),
        ),

        // Announcements (UX-6)
        ChangeNotifierProvider<AnnouncementProvider>(
          create: (_) => AnnouncementProvider(notificationsRepository),
        ),

        // Onboarding (UX-8)
        ChangeNotifierProvider<OnboardingProvider>(
          create: (_) => OnboardingProvider(prefs),
        ),
      ],
      child: const App(),
    ),
  );
}

/// Minimal error screen shown on initialization failure.
class _ErrorApp extends StatelessWidget {
  final String message;
  const _ErrorApp(this.message);

  @override
  Widget build(BuildContext context) {
    return CupertinoApp(
      home: CupertinoPageScaffold(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Initialization Error\n\n$message\n\nPlease refresh the page.'),
          ),
        ),
      ),
    );
  }
}
