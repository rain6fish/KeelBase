import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/search/data/models/search_result.dart';

void main() {
  test('fromJson 解析 events/users 分页结构', () {
    final r = SearchResult.fromJson({
      'events': {
        'items': [
          {
            'id': 1,
            'title': '会议',
            'startTime': '2026-08-16T09:00:00.000Z',
            'endTime': '2026-08-16T10:00:00.000Z',
            'createdAt': '2026-08-01T00:00:00.000Z',
            'updatedAt': '2026-08-01T00:00:00.000Z',
          },
        ],
      },
      'users': {
        'items': [
          {'id': 2, 'username': 'alex', 'email': 'a@b.com', 'nickname': 'Alex'},
        ],
      },
    });
    expect(r.events, hasLength(1));
    expect(r.events.first.title, '会议');
    expect(r.users, hasLength(1));
    expect(r.users.first.username, 'alex');
  });

  test('缺字段时返回空列表', () {
    final r = SearchResult.fromJson({});
    expect(r.events, isEmpty);
    expect(r.users, isEmpty);
  });
}
