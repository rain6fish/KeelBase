// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/api/capabilities_provider.dart';
import 'package:front_app/core/api/capabilities_repository.dart';
import 'package:front_app/features/ai/presentation/providers/ai_chat_provider.dart';
import 'package:front_app/features/announcements/presentation/providers/announcement_provider.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import 'package:front_app/features/dashboard/presentation/pages/dashboard_page.dart';
import 'package:front_app/features/events/data/repositories/events_repository.dart';
import 'package:front_app/features/insights/data/models/insights_model.dart';
import 'package:front_app/features/insights/presentation/providers/insights_provider.dart';
import '../helpers.dart';

class MockAuthProvider extends Mock implements AuthProvider {}

void main() {
  late MockEventsRepository eventsRepository;
  late MockInsightsRepository insightsRepository;
  late MockNotificationsRepository notificationsRepository;
  late MockApiClient apiClient;
  late MockSseClient sseClient;
  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    eventsRepository = MockEventsRepository();
    when(() => eventsRepository.getEvents(any(), any())).thenAnswer((_) async => []);
    when(() => eventsRepository.searchEvents(page: any(named: 'page'), limit: any(named: 'limit')))
        .thenAnswer((_) async => {'total': 0});

    insightsRepository = MockInsightsRepository();
    when(() => insightsRepository.getInsights(days: any(named: 'days'))).thenAnswer(
      (_) async => InsightsModel(
        totalEvents: 0,
        activeEvents: 0,
        cancelledEvents: 0,
        recentEvents: 0,
        monthlyBreakdown: const [],
        summary: '',
      ),
    );

    notificationsRepository = MockNotificationsRepository();
    when(() => notificationsRepository.getNotifications(page: any(named: 'page'), limit: any(named: 'limit')))
        .thenAnswer((_) async => []);

    apiClient = MockApiClient();
    sseClient = MockSseClient();
  });

  Widget wrap() {
    final auth = MockAuthProvider();
    when(() => auth.user).thenReturn(null);
    return wrapCupertinoPage(
      const DashboardPage(),
      providers: [
        // MOD-4/EASY-5：Dashboard build 时 context.watch<CapabilitiesProvider>()，
        // initState 里 _checkPresetGuide() 读取 SharedPreferences
        Provider<SharedPreferences>.value(value: prefs),
        ChangeNotifierProvider<CapabilitiesProvider>(
          create: (_) => CapabilitiesProvider(CapabilitiesRepository(apiClient)),
        ),
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<AiChatProvider>(
          create: (_) => AiChatProvider(apiClient, sseClient),
        ),
        ChangeNotifierProvider<InsightsProvider>(
          create: (_) => InsightsProvider(insightsRepository),
        ),
        ChangeNotifierProvider<AnnouncementProvider>(
          create: (_) => AnnouncementProvider(notificationsRepository),
        ),
        Provider<EventsRepository>.value(value: eventsRepository),
      ],
    );
  }

  testWidgets('渲染仪表盘（问候语 + 今日安排 + 快捷入口）', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('首页'), findsOneWidget);
    expect(find.text('今日日程'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
