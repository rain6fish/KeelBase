import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/events/data/models/event_model.dart';
import 'package:front_app/features/events/presentation/providers/events_provider.dart';
import '../../helpers.dart';

void main() {
  late MockEventsRepository repository;
  late EventsProvider provider;

  EventModel makeEvent(int id, {int day = 10, String title = 'Event'}) {
    return EventModel(
      id: id,
      title: title,
      startTime: DateTime(2026, 8, day, 9, 0),
      endTime: DateTime(2026, 8, day, 10, 0),
      createdAt: DateTime(2026, 8, 1),
      updatedAt: DateTime(2026, 8, 1),
    );
  }

  setUp(() {
    repository = MockEventsRepository();
    provider = EventsProvider(repository);
    // 固定日期，避开 DateTime.now() 不确定性
    provider.selectDate(DateTime(2026, 8, 10));
  });

  tearDown(() {
    provider.dispose();
  });

  group('loadCalendar', () {
    test('成功 → events 填充、loading false', () async {
      when(() => repository.getEvents(any(), any()))
          .thenAnswer((_) async => [makeEvent(1), makeEvent(2, day: 12)]);

      await provider.loadCalendar();

      expect(provider.loading, isFalse);
      expect(provider.error, isNull);
      expect(provider.eventsByDate, isNotEmpty);
      // 8-10 应包含 event 1
      expect(provider.currentDayEvents.length, 1);
    });

    test('失败 → error 设置', () async {
      when(() => repository.getEvents(any(), any()))
          .thenThrow(Exception('network error'));

      await provider.loadCalendar();

      expect(provider.error, isNotNull);
      expect(provider.loading, isFalse);
    });
  });

  group('search', () {
    test('成功 → 结果填充、hasMore 正确', () async {
      when(() => repository.searchEvents(
        keyword: any(named: 'keyword'),
        start: any(named: 'start'),
        end: any(named: 'end'),
        page: any(named: 'page'),
        limit: any(named: 'limit'),
      )).thenAnswer((_) async => {
        'items': [
          {
            'id': 1,
            'title': 'Meeting',
            'startTime': '2026-08-10T09:00:00Z',
            'endTime': '2026-08-10T10:00:00Z',
            'isCancelled': false,
            'isRecurring': false,
            'createdAt': '2026-08-01T00:00:00Z',
            'updatedAt': '2026-08-01T00:00:00Z',
          },
        ],
        'total': 25,
        'totalPages': 2,
      });

      provider.setKeyword('Meeting');
      await provider.search();

      expect(provider.mode, EventsMode.search);
      expect(provider.events.length, 1);
      expect(provider.events[0].title, 'Meeting');
      expect(provider.hasMore, isTrue);
      expect(provider.total, 25);
    });

    test('失败 → error 设置', () async {
      when(() => repository.searchEvents(
        keyword: any(named: 'keyword'),
        start: any(named: 'start'),
        end: any(named: 'end'),
        page: any(named: 'page'),
        limit: any(named: 'limit'),
      )).thenThrow(Exception('boom'));

      await provider.search();

      expect(provider.error, isNotNull);
    });
  });

  group('create', () {
    test('成功 → 返回 true、事件加入缓存', () async {
      when(() => repository.createEvent(any())).thenAnswer(
        (_) async => makeEvent(10, day: 10, title: 'New Event'),
      );

      final ok = await provider.create({'title': 'New Event'});

      expect(ok, isTrue);
      expect(provider.currentDayEvents.any((e) => e.title == 'New Event'), isTrue);
    });

    test('失败 → 返回 false、error 设置', () async {
      when(() => repository.createEvent(any()))
          .thenThrow(Exception('validation error'));

      final ok = await provider.create({'title': 'Bad'});

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('update', () {
    test('成功 → 返回 true', () async {
      when(() => repository.updateEvent(any(), any())).thenAnswer((_) async => makeEvent(1));
      when(() => repository.getEvents(any(), any())).thenAnswer((_) async => [makeEvent(1)]);

      final ok = await provider.update(1, {'title': 'Updated'});

      expect(ok, isTrue);
    });

    test('失败 → 返回 false', () async {
      when(() => repository.updateEvent(any(), any())).thenThrow(Exception('boom'));

      final ok = await provider.update(1, {'title': 'X'});

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('delete', () {
    test('成功 → 返回 true', () async {
      when(() => repository.deleteEvent(any())).thenAnswer((_) async => null);
      when(() => repository.getEvents(any(), any())).thenAnswer((_) async => []);

      final ok = await provider.delete(1);

      expect(ok, isTrue);
    });

    test('失败 → 返回 false', () async {
      when(() => repository.deleteEvent(any())).thenThrow(Exception('boom'));

      final ok = await provider.delete(1);

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('导航', () {
    test('selectDate 更新当前事件', () {
      provider.selectDate(DateTime(2026, 8, 15));
      expect(provider.selectedDate, DateTime(2026, 8, 15));
    });

    test('setViewMode 切换视图', () {
      provider.setViewMode(CalendarViewMode.week);
      expect(provider.viewMode, CalendarViewMode.week);
    });
  });
}
