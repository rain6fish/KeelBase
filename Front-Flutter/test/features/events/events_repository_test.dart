import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/errors/exceptions.dart';
import 'package:front_app/features/events/data/models/event_model.dart';
import 'package:front_app/features/events/data/repositories/events_repository.dart';
import '../../helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockApiClient api;
  late EventsRepository repo;

  setUp(() {
    api = MockApiClient();
    repo = EventsRepository(api);
  });

  Map<String, dynamic> okEnvelope(Object? data, {int code = 200}) => {
        'code': code,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-22T00:00:00Z',
      };

  Map<String, dynamic> eventJson({int id = 1, String title = '晨会'}) => {
        'id': id,
        'title': title,
        'description': '每日晨会',
        'startTime': '2026-08-22T09:00:00Z',
        'endTime': '2026-08-22T10:00:00Z',
        'location': '会议室',
        'colorRole': 1,
        'isCancelled': false,
        'isRecurring': false,
        'reminderMinutes': 30,
        'createdAt': '2026-08-22T09:00:00Z',
        'updatedAt': '2026-08-22T09:00:00Z',
      };

  group('getEvents', () {
    test('解析事件列表并携带查询参数', () async {
      when(() => api.get('/events', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => okEnvelope([eventJson(), eventJson(id: 2, title: '评审')]));

      final events = await repo.getEvents('2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');

      expect(events.length, 2);
      expect(events.first.title, '晨会');
      expect(events.last.title, '评审');
      expect(events.first.colorRole, EventColorRole.red);

      final captured = verify(() => api.get('/events', queryParameters: captureAny(named: 'queryParameters'))).captured;
      final qp = captured.single as Map<String, dynamic>;
      expect(qp['start'], '2026-08-01T00:00:00Z');
      expect(qp['end'], '2026-08-31T23:59:59Z');
    });

    test('HTTP 非 2xx code 抛 NetworkException', () async {
      when(() => api.get('/events', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => okEnvelope(null, code: 500));

      expect(
        () => repo.getEvents('a', 'b'),
        throwsA(isA<NetworkException>()),
      );
    });

    test('data 非 List 抛 NetworkException', () async {
      when(() => api.get('/events', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => okEnvelope({'items': []}));

      expect(
        () => repo.getEvents('a', 'b'),
        throwsA(isA<NetworkException>()),
      );
    });
  });

  test('getEvent 解析单个事件', () async {
    when(() => api.get('/events/5')).thenAnswer((_) async => okEnvelope(eventJson(id: 5)));

    final event = await repo.getEvent(5);

    expect(event.id, 5);
    expect(event.title, '晨会');
  });

  test('createEvent 返回创建结果', () async {
    when(() => api.post('/events', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(eventJson(id: 9, title: '新建')));

    final event = await repo.createEvent({'title': '新建'});

    expect(event.id, 9);
    expect(event.title, '新建');
  });

  test('updateEvent 返回更新结果', () async {
    when(() => api.put('/events/1', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(eventJson(id: 1, title: '已改')));

    final event = await repo.updateEvent(1, {'title': '已改'});

    expect(event.title, '已改');
  });

  test('deleteEvent 成功', () async {
    when(() => api.delete('/events/1')).thenAnswer((_) async => okEnvelope(null));

    await repo.deleteEvent(1);
    verify(() => api.delete('/events/1')).called(1);
  });

  test('deleteEvent 非 2xx 抛 NetworkException', () async {
    when(() => api.delete('/events/1')).thenAnswer((_) async => okEnvelope(null, code: 403));

    expect(() => repo.deleteEvent(1), throwsA(isA<NetworkException>()));
  });

  group('searchEvents', () {
    test('携带分页与关键词参数并返回分页结构', () async {
      when(() => api.get('/events/search', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => okEnvelope({
                'items': [eventJson()],
                'total': 1,
                'totalPages': 1,
              }));

      final result = await repo.searchEvents(keyword: '晨会', page: 2, limit: 10);

      expect(result['total'], 1);
      final items = result['items'] as List;
      expect(items, hasLength(1));

      final captured = verify(() => api.get('/events/search', queryParameters: captureAny(named: 'queryParameters'))).captured;
      final qp = captured.single as Map<String, dynamic>;
      expect(qp['page'], 2);
      expect(qp['limit'], 10);
      expect(qp['keyword'], '晨会');
    });

    test('page/limit 边界被钳制', () async {
      when(() => api.get('/events/search', queryParameters: any(named: 'queryParameters')))
          .thenAnswer((_) async => okEnvelope({'items': [], 'total': 0, 'totalPages': 0}));

      await repo.searchEvents(page: 0, limit: 999);

      final captured = verify(() => api.get('/events/search', queryParameters: captureAny(named: 'queryParameters'))).captured;
      final qp = captured.single as Map<String, dynamic>;
      expect(qp['page'], 1);
      expect(qp['limit'], 100);
    });
  });
}
