import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/api/api_response.dart';

void main() {
  group('ApiResponse.fromJson', () {
    test('合法响应解析成功', () {
      final r = ApiResponse.fromJson(
        {'code': 200, 'message': 'ok', 'data': {'a': 1}, 'timestamp': 't'},
        (d) => (d as Map)['a'] as int,
      );
      expect(r.code, 200);
      expect(r.message, 'ok');
      expect(r.data, 1);
      expect(r.timestamp, 't');
      expect(r.isSuccess, isTrue);
    });

    test('code 为字符串时报描述性 FormatException（而非裸 TypeError）', () {
      expect(
        () => ApiResponse.fromJson(
            {'code': '200', 'message': 'ok', 'timestamp': 't'}, (_) => null),
        throwsA(isA<FormatException>()),
      );
    });

    test('缺少 message 时报 FormatException', () {
      expect(
        () => ApiResponse.fromJson({'code': 200, 'timestamp': 't'}, (_) => null),
        throwsA(isA<FormatException>()),
      );
    });

    test('timestamp 为 double 时报 FormatException', () {
      expect(
        () => ApiResponse.fromJson(
            {'code': 200, 'message': 'ok', 'timestamp': 1.0}, (_) => null),
        throwsA(isA<FormatException>()),
      );
    });

    test('data 为 null 时即使提供 parser 也是 null（兼容旧行为）', () {
      final r = ApiResponse.fromJson(
          {'code': 200, 'message': 'ok', 'data': null, 'timestamp': 't'},
          (d) => 1);
      expect(r.data, isNull);
    });
  });

  group('requireData / requireSuccess', () {
    test('requireData 返回数据', () {
      final r = ApiResponse<int>.fromJson(
          {'code': 200, 'message': 'ok', 'data': 7, 'timestamp': 't'},
          (d) => d as int);
      expect(r.requireData(), 7);
    });

    test('requireData 在 data 为 null 时抛 StateError（暴露契约不匹配）', () {
      final r = ApiResponse<int>.fromJson(
          {'code': 200, 'message': 'ok', 'data': null, 'timestamp': 't'},
          (d) => d as int);
      expect(() => r.requireData(), throwsA(isA<StateError>()));
    });

    test('requireSuccess 在非成功 envelope 抛 StateError', () {
      final r = ApiResponse<int>.fromJson(
          {'code': 401, 'message': 'nope', 'data': null, 'timestamp': 't'},
          (d) => d as int);
      expect(() => r.requireSuccess(), throwsA(isA<StateError>()));
    });

    test('requireSuccess 成功时返回 payload', () {
      final r = ApiResponse<int>.fromJson(
          {'code': 200, 'message': 'ok', 'data': 3, 'timestamp': 't'},
          (d) => d as int);
      expect(r.requireSuccess(), 3);
    });
  });

  group('PaginatedData.fromJson', () {
    test('正常分页解析', () {
      final p = PaginatedData<int>.fromJson(
          {'items': [1, 2, 3], 'total': 3, 'page': 1, 'limit': 20},
          (d) => d as int);
      expect(p.items, [1, 2, 3]);
      expect(p.total, 3);
      expect(p.page, 1);
      expect(p.limit, 20);
    });

    test('单条坏数据被跳过，其余保留（逐条容错）', () {
      final p = PaginatedData<int>.fromJson(
          {'items': [1, 'bad', 3], 'total': 3, 'page': 1, 'limit': 20},
          (d) => d as int);
      expect(p.items, [1, 3]);
    });

    test('缺失分页元数据报 FormatException（契约保证必填，不静默默认）', () {
      expect(
        () => PaginatedData<int>.fromJson({'items': [1]}, (d) => d as int),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
