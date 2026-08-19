import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/events/data/models/event_model.dart';
import 'package:front_app/features/events/presentation/pages/events_list_page.dart';
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

  /// 构造今天当天的事件（hour 0，避免日视图自动滚动动画）。
  List<EventModel> todayEvents() {
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    return [
      EventModel(
        id: 1,
        title: '晨会',
        startTime: day,
        endTime: day.add(const Duration(hours: 1)),
        createdAt: day,
        updatedAt: day,
      ),
      EventModel(
        id: 2,
        title: '评审',
        startTime: day.add(const Duration(hours: 2)),
        endTime: day.add(const Duration(hours: 3)),
        colorRole: EventColorRole.red,
        createdAt: day,
        updatedAt: day,
      ),
    ];
  }

  Widget wrap() => wrapCupertinoPage(
        const EventsListPage(),
        providers: [
          ChangeNotifierProvider<EventsProvider>.value(value: provider),
        ],
      );

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(wrap());
    // initState postFrameCallback 触发 loadCalendar()，推进异步 getEvents 完成
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('日视图渲染当日事件列表', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenAnswer((_) async => todayEvents());

    await pumpPage(tester);

    expect(find.text('事件'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget);
    expect(find.text('评审'), findsOneWidget);
    expect(find.text('2 个事件'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('日视图无事件时显示空态', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenAnswer((_) async => []);

    await pumpPage(tester);

    expect(find.text('此日期暂无事件'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('日历加载失败显示错误视图', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenThrow(Exception('网络错误'));

    await pumpPage(tester);

    expect(find.textContaining('网络错误'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('视图切换：日/周/月切换更新 provider 状态', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenAnswer((_) async => todayEvents());

    await pumpPage(tester);
    expect(provider.viewMode, CalendarViewMode.day);

    await tester.tap(find.text('周'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(provider.viewMode, CalendarViewMode.week);

    await tester.tap(find.text('月'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(provider.viewMode, CalendarViewMode.month);
    expect(tester.takeException(), isNull);
  });

  testWidgets('搜索面板：输入关键词搜索并渲染结果', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenAnswer((_) async => todayEvents());
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    final result = {
      'id': 9,
      'title': '评审',
      'description': null,
      'startTime': day.toIso8601String(),
      'endTime': day.add(const Duration(hours: 1)).toIso8601String(),
      'location': null,
      'colorRole': 0,
      'isCancelled': false,
      'isRecurring': false,
      'reminderMinutes': null,
      'createdAt': day.toIso8601String(),
      'updatedAt': day.toIso8601String(),
    };
    when(() => repository.searchEvents(
          keyword: '评审',
          start: null,
          end: null,
          page: any(named: 'page'),
          limit: any(named: 'limit'),
        ))
        .thenAnswer((_) async => {'items': [result], 'total': 1, 'totalPages': 1});

    await pumpPage(tester);

    // 打开搜索面板
    await tester.tap(find.byIcon(CupertinoIcons.search));
    await tester.pump();

    // 输入关键词并提交搜索
    await tester.enterText(find.byType(CupertinoTextField), '评审');
    await tester.pump();
    await tester.tap(find.text('搜索'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('搜索结果 (1)'), findsOneWidget);
    expect(find.text('评审'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('搜索面板：点「全部」加载分页全量列表', (tester) async {
    when(() => repository.getEvents(any(), any()))
        .thenAnswer((_) async => todayEvents());
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    final result = {
      'id': 3,
      'title': '周报',
      'description': null,
      'startTime': day.toIso8601String(),
      'endTime': day.add(const Duration(hours: 1)).toIso8601String(),
      'location': null,
      'colorRole': 0,
      'isCancelled': false,
      'isRecurring': false,
      'reminderMinutes': null,
      'createdAt': day.toIso8601String(),
      'updatedAt': day.toIso8601String(),
    };
    when(() => repository.searchEvents(
          page: any(named: 'page'),
          limit: any(named: 'limit'),
        ))
        .thenAnswer((_) async => {'items': [result], 'total': 1, 'totalPages': 1});

    await pumpPage(tester);

    await tester.tap(find.byIcon(CupertinoIcons.search));
    await tester.pump();
    await tester.tap(find.text('全部'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('周报'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
