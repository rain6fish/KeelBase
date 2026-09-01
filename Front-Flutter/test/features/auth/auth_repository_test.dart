// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/errors/exceptions.dart';
import 'package:front_app/features/auth/data/repositories/auth_repository.dart';
import '../../helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockApiClient api;
  late AuthRepository repo;

  setUp(() {
    api = MockApiClient();
    repo = AuthRepository(api);
  });

  Map<String, dynamic> okEnvelope([Map<String, dynamic>? data]) => {
        'code': 0,
        'message': 'ok',
        'data': data,
        'timestamp': '2026-08-22T00:00:00Z',
      };

  Map<String, dynamic> tokenEnvelope() => okEnvelope({
        'accessToken': 'access-1',
        'refreshToken': 'refresh-1',
        'user': {'id': 1, 'username': 'alex', 'email': 'a@b.com', 'nickname': 'Alex'},
      });

  Map<String, dynamic> errEnvelope() => {
        'code': 1001,
        'message': '用户名或密码错误',
        'data': null,
        'timestamp': '2026-08-22T00:00:00Z',
      };

  group('login', () {
    test('成功登录返回 TokenModel 并携带设备名', () async {
      when(() => api.post('/auth/login', data: any(named: 'data')))
          .thenAnswer((_) async => tokenEnvelope());

      final token = await repo.login('alex', 'secret');

      expect(token.accessToken, 'access-1');
      expect(token.refreshToken, 'refresh-1');
      expect(token.user.username, 'alex');

      final captured = verify(() => api.post('/auth/login', data: captureAny(named: 'data'))).captured;
      final data = captured.single as Map<String, dynamic>;
      expect(data['username'], 'alex');
      expect(data['password'], 'secret');
      expect(data['deviceName'], isNotEmpty);
    });

    test('业务 code 非 0 抛 AuthException', () async {
      when(() => api.post('/auth/login', data: any(named: 'data')))
          .thenAnswer((_) async => errEnvelope());

      expect(
        () => repo.login('alex', 'wrong'),
        throwsA(isA<AuthException>().having((e) => e.message, 'message', contains('用户名或密码错误'))),
      );
    });
  });

  test('register 成功返回 TokenModel', () async {
    when(() => api.post('/auth/register', data: any(named: 'data')))
        .thenAnswer((_) async => tokenEnvelope());

    final token = await repo.register(
      username: 'alex',
      email: 'a@b.com',
      password: 'secret1',
      nickname: 'Alex',
    );

    expect(token.user.email, 'a@b.com');
    verify(() => api.post('/auth/register', data: any(named: 'data'))).called(1);
  });

  group('oauthLogin', () {
    test('无凭证抛 ArgumentError，不发请求', () async {
      expect(
        () => repo.oauthLogin(provider: 'google'),
        throwsA(isA<ArgumentError>()),
      );
      verifyNever(() => api.post('/auth/oauth', data: any(named: 'data')));
    });

    test('idToken 登录成功', () async {
      when(() => api.post('/auth/oauth', data: any(named: 'data')))
          .thenAnswer((_) async => tokenEnvelope());

      final token = await repo.oauthLogin(provider: 'google', idToken: 'jwt-token');

      expect(token.accessToken, 'access-1');
      final captured = verify(() => api.post('/auth/oauth', data: captureAny(named: 'data'))).captured;
      final data = captured.single as Map<String, dynamic>;
      expect(data['provider'], 'google');
      expect(data['idToken'], 'jwt-token');
    });

    test('authorizationCode 登录成功', () async {
      when(() => api.post('/auth/oauth', data: any(named: 'data')))
          .thenAnswer((_) async => tokenEnvelope());

      final token = await repo.oauthLogin(provider: 'wechat', authorizationCode: 'code-1');

      expect(token.accessToken, 'access-1');
    });
  });

  test('getProfile 返回用户信息', () async {
    when(() => api.get('/auth/me')).thenAnswer((_) async => okEnvelope({
          'id': 1,
          'username': 'alex',
          'email': 'a@b.com',
          'nickname': 'Alex',
        }));

    final user = await repo.getProfile();

    expect(user.username, 'alex');
    expect(user.role, 'user');
  });

  test('requestPasswordReset 成功后不抛异常', () async {
    when(() => api.post('/auth/forgot-password', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(null));

    await repo.requestPasswordReset('a@b.com');
    verify(() => api.post('/auth/forgot-password', data: any(named: 'data'))).called(1);
  });

  test('verifyEmail 成功', () async {
    when(() => api.post('/auth/verify-email', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(null));

    await repo.verifyEmail('a@b.com', '123456');
    verify(() => api.post('/auth/verify-email', data: any(named: 'data'))).called(1);
  });

  test('bindPhone 成功', () async {
    when(() => api.post('/auth/bind-phone', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(null));

    await repo.bindPhone('13800000000', '123456');
    verify(() => api.post('/auth/bind-phone', data: any(named: 'data'))).called(1);
  });

  test('loginPhone 成功', () async {
    when(() => api.post('/auth/login-phone', data: any(named: 'data')))
        .thenAnswer((_) async => tokenEnvelope());

    final token = await repo.loginPhone('13800000000', '123456');

    expect(token.accessToken, 'access-1');
    final captured = verify(() => api.post('/auth/login-phone', data: captureAny(named: 'data'))).captured;
    final data = captured.single as Map<String, dynamic>;
    expect(data['phone'], '13800000000');
    expect(data['deviceName'], isNotEmpty);
  });

  test('deactivate 成功', () async {
    when(() => api.post('/auth/deactivate', data: any(named: 'data')))
        .thenAnswer((_) async => okEnvelope(null));

    await repo.deactivate('secret');
    verify(() => api.post('/auth/deactivate', data: any(named: 'data'))).called(1);
  });

  group('logout', () {
    test('成功登出', () async {
      when(() => api.post('/auth/logout')).thenAnswer((_) async => okEnvelope(null));

      await repo.logout();
      verify(() => api.post('/auth/logout')).called(1);
    });

    test('登出接口失败不抛异常（非致命）', () async {
      when(() => api.post('/auth/logout')).thenThrow(Exception('网络错误'));

      await repo.logout(); // 不应抛出
      verify(() => api.post('/auth/logout')).called(1);
    });
  });

  test('exportData 返回本人数据', () async {
    when(() => api.get('/auth/export-data')).thenAnswer((_) async => okEnvelope({
          'events': <Object>[],
          'todos': <Object>[],
        }));

    final data = await repo.exportData();

    expect(data['events'], isA<List<Object>>());
  });

  test('exportData 业务失败抛 AuthException', () async {
    when(() => api.get('/auth/export-data')).thenAnswer((_) async => errEnvelope());

    expect(() => repo.exportData(), throwsA(isA<AuthException>()));
  });
}
