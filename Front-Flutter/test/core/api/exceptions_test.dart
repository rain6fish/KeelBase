// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/errors/exceptions.dart';

void main() {
  group('RateLimitException.retryAfter 边界', () {
    test('正常值原样保留', () {
      expect(RateLimitException('x', 5).retryAfter, 5);
    });

    test('0 保留（语义：立即重试）', () {
      expect(RateLimitException('x', 0).retryAfter, 0);
    });

    test('负数被钳制为 0（避免驱动负倒计时）', () {
      expect(RateLimitException('x', -3).retryAfter, 0);
      expect(RateLimitException('x', -1).retryAfter, 0);
    });

    test('极大值原样保留', () {
      expect(RateLimitException('x', 3600).retryAfter, 3600);
    });
  });

  group('cause / stackTrace 保留', () {
    test('NetworkException 携带 cause 与 stackTrace', () {
      final cause = StateError('boom');
      final e = NetworkException(
        'net',
        cause: cause,
        stackTrace: StackTrace.current,
      );
      expect(e.cause, same(cause));
      expect(e.stackTrace, isNotNull);
      expect(e.toString(), 'net');
    });

    test('AuthException / ValidationException / RateLimitException 同样支持', () {
      final cause = Exception('root');
      expect(AuthException('a', cause: cause).cause, same(cause));
      expect(ValidationException('v', cause: cause).cause, same(cause));
      expect(RateLimitException('r', 1, cause: cause).cause, same(cause));
    });

    test('默认构造（无 cause/stackTrace）兼容旧调用', () {
      expect(NetworkException('x').cause, isNull);
      expect(AuthException('y').stackTrace, isNull);
      expect(NetworkException('x').message, 'x');
    });
  });
}
