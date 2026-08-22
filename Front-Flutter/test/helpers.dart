import 'package:flutter/cupertino.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/core/api/sse_client.dart';
import 'package:front_app/features/auth/data/repositories/auth_repository.dart';
import 'package:front_app/features/events/data/repositories/events_repository.dart';
import 'package:front_app/features/splash/data/repositories/splash_repository.dart';
import 'package:front_app/features/notifications/data/repositories/notifications_repository.dart';
import 'package:front_app/features/ai/data/repositories/ai_conversation_repository.dart';
import 'package:front_app/features/sessions/data/repositories/session_repository.dart';
import 'package:front_app/features/search/data/repositories/search_repository.dart';
import 'package:front_app/features/todos/data/repositories/todos_repository.dart';
import 'package:front_app/features/version/data/repositories/version_repository.dart';
import 'package:front_app/features/insights/data/repositories/insights_repository.dart';
import 'package:front_app/features/forms/data/repositories/form_repository.dart';
import 'package:front_app/features/books/data/repositories/books_repository.dart';
import 'package:front_app/features/notes/data/repositories/notes_repository.dart';
import 'package:front_app/features/tags/data/repositories/tags_repository.dart';
import 'package:front_app/features/upload/data/repositories/upload_repository.dart';
import 'package:front_app/features/org/data/repositories/org_repository.dart';
import 'package:front_app/features/flows/data/repositories/flows_repository.dart';
import 'package:front_app/features/posts/data/repositories/posts_repository.dart';

/// Mock ApiClient — AuthProvider 构造依赖真实 ApiClient 实例，用 mocktail 生成。
class MockApiClient extends Mock implements ApiClient {}

class MockAuthRepository extends Mock implements AuthRepository {}

class MockEventsRepository extends Mock implements EventsRepository {}

class MockSplashRepository extends Mock implements SplashRepository {}

class MockNotificationsRepository extends Mock implements NotificationsRepository {}

class MockSseClient extends Mock implements SseClient {}

class MockAiConversationRepository extends Mock implements AiConversationRepository {}

class MockSessionRepository extends Mock implements SessionRepository {}

class MockSearchRepository extends Mock implements SearchRepository {}

class MockTodosRepository extends Mock implements TodosRepository {}

class MockVersionRepository extends Mock implements VersionRepository {}

class MockInsightsRepository extends Mock implements InsightsRepository {}

class MockFormRepository extends Mock implements FormRepository {}

class MockBooksRepository extends Mock implements BooksRepository {}

class MockNotesRepository extends Mock implements NotesRepository {}

class MockTagsRepository extends Mock implements TagsRepository {}

class MockUploadRepository extends Mock implements UploadRepository {}

class MockOrgRepository extends Mock implements OrgRepository {}

class MockFlowsRepository extends Mock implements FlowsRepository {}

class MockPostsRepository extends Mock implements PostsRepository {}

/// 用 MultiProvider 包裹被测 widget（供 widget test 使用）。
Widget wrapWithProviders({
  required Widget child,
  List<SingleChildWidget> providers = const [],
}) {
  return MultiProvider(providers: providers, child: child);
}

/// 强制中文 locale 的 CupertinoApp 页面 harness（widget test 断言中文文案用）。
/// 在 home 上方直接放 Localizations（zh_CN），页面 context 向上查找即命中。
/// home 级 Localizations 需要同时提供 Widgets/Cupertino/App 三类 delegate，
/// 否则 CupertinoNavigationBarBackButton 等组件找不到 CupertinoLocalizations。
Widget wrapCupertinoPage(
  Widget page, {
  List<SingleChildWidget> providers = const [],
}) {
  final app = CupertinoApp(
    home: Localizations(
      locale: const Locale('zh', 'CN'),
      delegates: const [
        AppLocalizations.delegate,
        DefaultWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      child: page,
    ),
  );
  if (providers.isEmpty) return app;
  return MultiProvider(providers: providers, child: app);
}

/// 强制中文 locale、页面作为可 pop 路由 push 的 harness。
/// 与 [wrapCupertinoPage] 的区别：
/// 1. 页面通过 Navigator.push 进入（CupertinoNavigationBarBackButton 断言当前路由可 pop）；
/// 2. localizationsDelegates 注册在 App 层，dialog/action sheet 里也能解析 AppLocalizations。
Widget wrapPushableCupertinoPage(
  Widget page, {
  List<SingleChildWidget> providers = const [],
}) {
  Widget app = CupertinoApp(
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('en', 'US'), Locale('zh', 'CN')],
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: Builder(
      builder: (context) => Center(
        child: CupertinoButton(
          onPressed: () => Navigator.of(context).push(
            CupertinoPageRoute<void>(builder: (_) => page),
          ),
          child: const Text('open'),
        ),
      ),
    ),
  );
  if (providers.isEmpty) return app;
  return MultiProvider(providers: providers, child: app);
}

/// 构造一个固定日期的 EventModel（避免 DateTime.now() 不确定性）。
DateTime fixedDate({int year = 2026, int month = 8, int day = 10, int hour = 9}) {
  return DateTime(year, month, day, hour);
}
