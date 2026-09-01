// SPDX-License-Identifier: Apache-2.0

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/api/api_client.dart';
import 'package:front_app/core/errors/exceptions.dart';
import 'package:front_app/core/security/secure_storage_service.dart';

class MockSecureStorageService extends Mock implements SecureStorageService {}

/// 最小可用的 Dio HttpClientAdapter：按 RequestOptions 返回预设响应。
class _StubAdapter implements HttpClientAdapter {
  Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> captured = [];

  _StubAdapter(this.handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    captured.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, int status) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockSecureStorageService storage;
  late _StubAdapter adapter;
  late Dio dio;
  late ApiClient client;

  setUp(() {
    storage = MockSecureStorageService();
    when(() => storage.write(any(), any())).thenAnswer((_) async {});
    when(() => storage.delete(any())).thenAnswer((_) async {});
    when(() => storage.read(any())).thenAnswer((_) async => null);

    adapter = _StubAdapter((options) async =>
        _json({'code': 200, 'message': 'ok', 'data': null, 'timestamp': ''}, 200));
    dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    client = ApiClient(storage, dio: dio);
  });

  group('setTokens / clearTokens / accessToken / refreshToken', () {
    test('setTokens 写入内存 accessToken 并持久化 refresh token', () async {
      await client.setTokens(accessToken: 'at', refreshToken: 'rt');
      expect(client.accessToken, 'at');
      verify(() => storage.write(any(), 'rt')).called(1);
    });

    test('clearTokens 清空 accessToken 并删除 refresh token', () async {
      await client.setTokens(accessToken: 'at', refreshToken: 'rt');
      await client.clearTokens();
      expect(client.accessToken, isNull);
      verify(() => storage.delete(any())).called(1);
    });

    test('refreshToken getter 委托 storage.read', () async {
      when(() => storage.read(any())).thenAnswer((_) async => 'stored-rt');
      expect(await client.refreshToken, 'stored-rt');
    });
  });

  group('HTTP 方法', () {
    test('GET 返回响应体 Map 并携带 Bearer 头', () async {
      await client.setTokens(accessToken: 'tok', refreshToken: 'rt');
      adapter.handler = (options) async => _json(
        {'code': 200, 'message': 'ok', 'data': {'a': 1}, 'timestamp': ''},
        200,
      );

      final res = await client.get('/events', queryParameters: {'page': 1});
      expect(res['data'], {'a': 1});
      expect(adapter.captured.single.headers['Authorization'], 'Bearer tok');
      expect(adapter.captured.single.path, '/events');
    });

    test('POST/PUT/PATCH/DELETE 委托对应方法', () async {
      for (final (method, call) in [
        ('POST', () => client.post('/x', data: {'k': 'v'})),
        ('PUT', () => client.put('/x', data: {'k': 'v'})),
        ('PATCH', () => client.patch('/x', data: {'k': 'v'})),
        ('DELETE', () => client.delete('/x')),
      ]) {
        final res = await call();
        expect(res, containsPair('code', 200));
        expect(adapter.captured.last.method, method);
      }
    });
  });

  group('错误映射 (_handleError)', () {
    Future<void> expectMapped(DioExceptionType type, int? status, Object? data,
        Matcher matcher) async {
      adapter.handler = (options) async {
        throw DioException(
          requestOptions: options,
          type: type,
          response: status != null
              ? Response(requestOptions: options, statusCode: status, data: data)
              : null,
        );
      };
      await expectLater(client.get('/x'), throwsA(matcher));
    }

    test('连接超时/接收超时 → NetworkException', () async {
      await expectMapped(DioExceptionType.connectionTimeout, null, null,
          isA<NetworkException>());
      await expectMapped(DioExceptionType.receiveTimeout, null, null,
          isA<NetworkException>());
    });

    test('连接错误 → NetworkException', () async {
      await expectMapped(DioExceptionType.connectionError, null, null,
          isA<NetworkException>());
    });

    test('401/403 → AuthException', () async {
      await expectMapped(
          DioExceptionType.badResponse, 401, {'message': '未授权'}, isA<AuthException>());
      await expectMapped(
          DioExceptionType.badResponse, 403, {'message': '禁止'}, isA<AuthException>());
    });

    test('429 + retryAfter → RateLimitException 带重试秒数', () async {
      await expectMapped(DioExceptionType.badResponse, 429,
          {'message': '太频繁', 'retryAfter': 5}, isA<RateLimitException>()
            .having((e) => e.retryAfter, 'retryAfter', 5));
    });

    test('其他状态码 → NetworkException', () async {
      await expectMapped(
          DioExceptionType.badResponse, 500, {'message': '服务器错误'}, isA<NetworkException>());
    });
  });

  group('401 → 刷新失败 → onAuthFailure', () {
    test('refresh token 缺失时回调 onAuthFailure 并抛 AuthException', () async {
      // storage.read 返回 null（refresh token 不存在）→ _doRefresh 直接失败
      adapter.handler = (options) async => _json({'message': '未授权'}, 401);
      var authFailureCalled = false;
      client.onAuthFailure = () async {
        authFailureCalled = true;
      };

      await expectLater(client.get('/protected'), throwsA(isA<AuthException>()));
      expect(authFailureCalled, isTrue);
    });
  });

  group('401 → 刷新（single-flight）', () {
    setUp(() {
      when(() => storage.read(any())).thenAnswer((_) async => 'rt');
    });

    test('刷新接口网络错误不触发 onAuthFailure，抛 NetworkException', () async {
      adapter.handler = (options) async {
        if (options.path == '/auth/refresh') {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
          );
        }
        return _json({'message': '未授权'}, 401);
      };
      await client.setTokens(accessToken: 'at', refreshToken: 'rt');
      var authFailureCalled = false;
      client.onAuthFailure = () async {
        authFailureCalled = true;
      };

      await expectLater(client.get('/protected'), throwsA(isA<NetworkException>()));
      expect(authFailureCalled, isFalse);
    });

    test('刷新接口返回 401（token 无效）触发 onAuthFailure', () async {
      adapter.handler = (options) async => _json({'message': '无效'}, 401);
      await client.setTokens(accessToken: 'at', refreshToken: 'rt');
      var authFailureCalled = false;
      client.onAuthFailure = () async {
        authFailureCalled = true;
      };

      await expectLater(client.get('/protected'), throwsA(isA<AuthException>()));
      expect(authFailureCalled, isTrue);
    });

    test('刷新成功自动重试原请求并更新 token', () async {
      var protectedHits = 0;
      adapter.handler = (options) async {
        if (options.path == '/auth/refresh') {
          return _json({
            'code': 200,
            'message': 'ok',
            'data': {'accessToken': 'new-at', 'refreshToken': 'new-rt'},
            'timestamp': '',
          }, 200);
        }
        protectedHits++;
        return _json({'code': 200, 'message': 'ok', 'data': {'ok': true}, 'timestamp': ''},
            protectedHits == 1 ? 401 : 200);
      };
      await client.setTokens(accessToken: 'old-at', refreshToken: 'rt');

      final res = await client.get('/protected');
      expect(res['data'], {'ok': true});
      expect(protectedHits, 2);
      expect(client.accessToken, 'new-at');
    });

    test('重试失败传播重试的真实错误而非原始 401', () async {
      adapter.handler = (options) async {
        if (options.path == '/auth/refresh') {
          return _json({
            'code': 200,
            'message': 'ok',
            'data': {'accessToken': 'new-at', 'refreshToken': 'new-rt'},
            'timestamp': '',
          }, 200);
        }
        return _json({'message': '服务器错误'}, 500);
      };
      await client.setTokens(accessToken: 'at', refreshToken: 'rt');

      await expectLater(client.get('/protected'), throwsA(isA<NetworkException>()));
    });

    test('并发 401 只触发一次刷新并都重试成功', () async {
      var protectedHits = 0;
      var refreshCalls = 0;
      adapter.handler = (options) async {
        if (options.path == '/auth/refresh') {
          refreshCalls++;
          return _json({
            'code': 200,
            'message': 'ok',
            'data': {'accessToken': 'new-at', 'refreshToken': 'new-rt'},
            'timestamp': '',
          }, 200);
        }
        protectedHits++;
        return _json({'code': 200, 'message': 'ok', 'data': {'ok': true}, 'timestamp': ''},
            protectedHits <= 2 ? 401 : 200);
      };
      await client.setTokens(accessToken: 'old-at', refreshToken: 'rt');

      final results = await Future.wait([client.get('/protected'), client.get('/protected')]);
      expect(results, hasLength(2));
      for (final r in results) {
        expect(r['data'], {'ok': true});
      }
      expect(refreshCalls, 1);
    });
  });
}
