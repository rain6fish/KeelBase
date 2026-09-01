// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/features/events/data/models/event_model.dart';
import 'package:front_app/features/events/data/repositories/events_repository.dart';
import 'package:front_app/features/events/presentation/pages/event_form_page.dart';
import 'package:front_app/features/events/presentation/providers/events_provider.dart';
import '../helpers.dart';

void main() {
  late MockEventsRepository repository;
  late EventsProvider provider;

  setUp(() {
    repository = MockEventsRepository();
    provider = EventsProvider(repository);
  });

  tearDown(() {
    provider.dispose();
  });

  final now = DateTime.now();
  final day = DateTime(now.year, now.month, now.day);

  EventModel event({int id = 1, String title = '站会'}) => EventModel(
        id: id,
        title: title,
        description: '每日站会',
        startTime: day,
        endTime: day.add(const Duration(hours: 1)),
        location: '会议室',
        colorRole: EventColorRole.green,
        reminderMinutes: 30,
        createdAt: day,
        updatedAt: day,
      );

  late GoRouter router;

  Widget wrapForm() {
    router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(path: '/home', builder: (_, __) => const SizedBox.shrink()),
        GoRoute(
          path: '/events/create',
          builder: (_, __) => const EventFormPage(),
        ),
        GoRoute(
          path: '/events/:id/edit',
          builder: (_, state) => EventFormPage(
            eventId: int.tryParse(state.pathParameters['id'] ?? ''),
          ),
        ),
      ],
    );
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<EventsProvider>.value(value: provider),
        Provider<EventsRepository>.value(value: repository),
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

  /// 打开新建/编辑表单（从占位首页 push，保证 pop 有可返回路由）。
  Future<void> pumpForm(WidgetTester tester, {int? eventId}) async {
    await tester.pumpWidget(wrapForm());
    await tester.pumpAndSettle();
    if (eventId == null) {
      router.push('/events/create');
    } else {
      router.push('/events/$eventId/edit');
    }
    await tester.pumpAndSettle();
  }

  testWidgets('新建模式渲染表单字段', (tester) async {
    when(() => repository.getEvents(any(), any())).thenAnswer((_) async => []);

    await pumpForm(tester);

    expect(find.text('新建事件'), findsOneWidget);
    expect(find.text('标题'), findsOneWidget);
    expect(find.text('描述'), findsWidgets); // 节标题 + 输入框占位符
    expect(find.text('地点'), findsWidgets); // 节标题 + 输入框占位符
    expect(find.text('开始时间'), findsOneWidget);
    expect(find.text('结束时间'), findsOneWidget);
    expect(find.text('颜色'), findsOneWidget);
    expect(find.text('重复事件'), findsOneWidget);
    expect(find.text('提醒'), findsOneWidget);
    expect(find.text('不提醒'), findsOneWidget);
    expect(find.text('创建'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('标题为空时点创建 → 提示且不调用 provider.create', (tester) async {
    when(() => repository.getEvents(any(), any())).thenAnswer((_) async => []);

    await pumpForm(tester);

    await tester.ensureVisible(find.text('创建'));
    await tester.pump();
    await tester.tap(find.text('创建'));
    await tester.pump();

    expect(find.text('请输入标题'), findsOneWidget);
    verifyNever(() => repository.createEvent(any()));
    // flush toast 的 2 秒自动消失 timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('填写标题后点创建 → 调用 provider.create 并提示成功', (tester) async {
    when(() => repository.getEvents(any(), any())).thenAnswer((_) async => []);
    when(() => repository.createEvent(any()))
        .thenAnswer((_) async => event(id: 3, title: '评审'));

    await pumpForm(tester);

    await tester.enterText(find.byType(CupertinoTextField).first, '评审');
    await tester.pump();

    await tester.ensureVisible(find.text('创建'));
    await tester.pump();
    await tester.tap(find.text('创建'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    verify(() => repository.createEvent(any())).called(1);
    expect(find.text('事件创建成功'), findsOneWidget);
    // flush toast timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('编辑模式加载事件并回显字段', (tester) async {
    when(() => repository.getEvent(5)).thenAnswer((_) async => event(id: 5));

    await pumpForm(tester, eventId: 5);

    expect(find.text('编辑事件'), findsOneWidget);
    expect(find.text('站会'), findsOneWidget); // 标题回显
    expect(find.text('提前 30 分钟'), findsOneWidget); // 提醒回显
    expect(find.text('更新'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('编辑模式加载失败显示错误视图', (tester) async {
    when(() => repository.getEvent(5)).thenThrow(Exception('加载失败'));

    await pumpForm(tester, eventId: 5);

    expect(find.text('编辑事件'), findsOneWidget);
    expect(find.text('出了点问题'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
