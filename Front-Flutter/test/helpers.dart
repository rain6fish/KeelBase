import 'package:flutter/widgets.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
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

/// 用 MultiProvider 包裹被测 widget（供 widget test 使用）。
Widget wrapWithProviders({
  required Widget child,
  List<Provider> providers = const [],
}) {
  return MultiProvider(providers: providers, child: child);
}

/// 构造一个固定日期的 EventModel（避免 DateTime.now() 不确定性）。
DateTime fixedDate({int year = 2026, int month = 8, int day = 10, int hour = 9}) {
  return DateTime(year, month, day, hour);
}
