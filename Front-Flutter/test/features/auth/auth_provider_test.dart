// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/auth/data/models/token_model.dart';
import 'package:front_app/features/auth/data/models/user_model.dart';
import 'package:front_app/features/auth/data/services/oauth_providers.dart';
import 'package:front_app/core/errors/exceptions.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import '../../helpers.dart';

class MockAppCache extends Mock implements AppCache {}

void main() {
  late MockApiClient apiClient;
  late MockAuthRepository authRepository;
  late MockSplashRepository splashRepository;
  late MockAppCache cache;
  late AuthProvider provider;

  final testUser = UserModel(
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    nickname: 'Tester',
  );

  final testTokens = TokenModel(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: testUser,
  );

  setUp(() {
    apiClient = MockApiClient();
    authRepository = MockAuthRepository();
    splashRepository = MockSplashRepository();
    cache = MockAppCache();
    when(() => cache.clearAll()).thenAnswer((_) async => null);
    provider = AuthProvider(
      authRepository: authRepository,
      splashRepository: splashRepository,
      apiClient: apiClient,
      cache: cache,
    );
  });

  tearDown(() {
    provider.dispose();
  });

  group('初始状态', () {
    test('status 为 initial，未认证', () {
      expect(provider.status, AuthStatus.initial);
      expect(provider.isAuthenticated, isFalse);
      expect(provider.user, isNull);
    });
  });

  group('login', () {
    test('成功 → authenticated 且设置 user', () async {
      when(() => authRepository.login('testuser', 'pass123'))
          .thenAnswer((_) async => testTokens);
      when(() => apiClient.setTokens(
        accessToken: any(named: 'accessToken'),
        refreshToken: any(named: 'refreshToken'),
      )).thenAnswer((_) async => null);

      final ok = await provider.login('testuser', 'pass123');

      expect(ok, isTrue);
      expect(provider.status, AuthStatus.authenticated);
      expect(provider.user?.username, 'testuser');
      expect(provider.isAuthenticated, isTrue);
    });

    test('失败 → error 且返回 false', () async {
      when(() => authRepository.login('testuser', 'wrong'))
          .thenThrow(Exception('invalid credentials'));

      final ok = await provider.login('testuser', 'wrong');

      expect(ok, isFalse);
      expect(provider.status, AuthStatus.error);
      expect(provider.error, isNotNull);
      expect(provider.isAuthenticated, isFalse);
    });
  });

  group('tryAutoLogin', () {
    test('有 token 且 getProfile 成功 → authenticated', () async {
      when(() => apiClient.refreshToken).thenAnswer((_) async => 'refresh-token');
      when(() => authRepository.getProfile()).thenAnswer((_) async => testUser);

      await provider.tryAutoLogin();

      expect(provider.status, AuthStatus.authenticated);
      expect(provider.user?.username, 'testuser');
    });

    test('无 token → unauthenticated', () async {
      when(() => apiClient.refreshToken).thenAnswer((_) async => null);

      await provider.tryAutoLogin();

      expect(provider.status, AuthStatus.unauthenticated);
    });

    test('getProfile 失败 → unauthenticated 且清 token', () async {
      when(() => apiClient.refreshToken).thenAnswer((_) async => 'refresh-token');
      when(() => authRepository.getProfile()).thenThrow(AuthException('session expired'));
      when(() => apiClient.clearTokens()).thenAnswer((_) async => null);

      await provider.tryAutoLogin();

      expect(provider.status, AuthStatus.unauthenticated);
      verify(() => apiClient.clearTokens()).called(1);
    });
  });

  group('logout', () {
    test('认证后登出 → 完全清除 user 和 token', () async {
      // 先通过 login 达到 authenticated 态
      when(() => authRepository.login('testuser', 'pass123'))
          .thenAnswer((_) async => testTokens);
      when(() => apiClient.setTokens(
        accessToken: any(named: 'accessToken'),
        refreshToken: any(named: 'refreshToken'),
      )).thenAnswer((_) async => null);
      when(() => authRepository.logout()).thenAnswer((_) async => null);
      when(() => apiClient.clearTokens()).thenAnswer((_) async => null);

      await provider.login('testuser', 'pass123');
      expect(provider.status, AuthStatus.authenticated);

      await provider.logout();

      expect(provider.user, isNull);
      expect(provider.status, AuthStatus.unauthenticated);
      verify(() => authRepository.logout()).called(1);
      verify(() => apiClient.clearTokens()).called(1);
      // CR-12：登出必须清离线缓存，防跨账号数据泄漏
      verify(() => cache.clearAll()).called(1);
    });
  });

  group('fetchProviderConfig', () {
    test('成功 → providerConfig 设置', () async {
      when(() => apiClient.get('/auth/oauth/providers')).thenAnswer(
        (_) async => {
          'code': 200,
          'message': 'ok',
          'data': {
            'providers': [
              {'name': 'google', 'enabled': true},
            ],
          },
          'timestamp': '2026-08-04T00:00:00Z',
        },
      );

      await provider.fetchProviderConfig();

      expect(provider.providerConfig, isNotNull);
    });

    test('失败 → 回退默认配置（不抛错）', () async {
      when(() => apiClient.get('/auth/oauth/providers'))
          .thenThrow(Exception('network error'));

      await provider.fetchProviderConfig();

      // 回退到默认配置，不崩溃
      expect(provider.providerConfig, isNotNull);
    });
  });

  group('clearError', () {
    test('清除 error', () async {
      when(() => authRepository.login('testuser', 'wrong'))
          .thenThrow(Exception('boom'));
      await provider.login('testuser', 'wrong');
      expect(provider.error, isNotNull);

      provider.clearError();

      expect(provider.error, isNull);
    });
  });

  group('requestPasswordReset', () {
    test('成功 → 返回 true', () async {
      when(() => authRepository.requestPasswordReset('test@example.com'))
          .thenAnswer((_) async => null);

      final ok = await provider.requestPasswordReset('test@example.com');

      expect(ok, isTrue);
      expect(provider.error, isNull);
    });

    test('失败 → 返回 false 并设置 error', () async {
      when(() => authRepository.requestPasswordReset('test@example.com'))
          .thenThrow(Exception('smtp down'));

      final ok = await provider.requestPasswordReset('test@example.com');

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('resetPassword', () {
    test('成功 → 返回 true', () async {
      when(() => authRepository.resetPassword('tok123', 'NewPass123'))
          .thenAnswer((_) async => null);

      final ok = await provider.resetPassword('tok123', 'NewPass123');

      expect(ok, isTrue);
      expect(provider.error, isNull);
    });

    test('失败 → 返回 false 并设置 error', () async {
      when(() => authRepository.resetPassword('tok123', 'NewPass123'))
          .thenThrow(Exception('invalid token'));

      final ok = await provider.resetPassword('tok123', 'NewPass123');

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('verifyEmail', () {
    test('成功 → 返回 true', () async {
      when(() => authRepository.verifyEmail('test@example.com', '123456'))
          .thenAnswer((_) async => null);

      final ok = await provider.verifyEmail('test@example.com', '123456');

      expect(ok, isTrue);
      expect(provider.error, isNull);
    });

    test('失败 → 返回 false 并设置 error', () async {
      when(() => authRepository.verifyEmail('test@example.com', '000000'))
          .thenThrow(Exception('invalid code'));

      final ok = await provider.verifyEmail('test@example.com', '000000');

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('resendVerification', () {
    test('成功 → 返回 true', () async {
      when(() => authRepository.resendVerification('test@example.com'))
          .thenAnswer((_) async => null);

      final ok = await provider.resendVerification('test@example.com');

      expect(ok, isTrue);
    });

    test('失败 → 返回 false 并设置 error', () async {
      when(() => authRepository.resendVerification('test@example.com'))
          .thenThrow(Exception('smtp down'));

      final ok = await provider.resendVerification('test@example.com');

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('loginPhone', () {
    test('成功 → authenticated 且设置 user', () async {
      when(() => authRepository.loginPhone('+8613800138000', '123456'))
          .thenAnswer((_) async => testTokens);
      when(() => apiClient.setTokens(
        accessToken: any(named: 'accessToken'),
        refreshToken: any(named: 'refreshToken'),
      )).thenAnswer((_) async => null);

      final ok = await provider.loginPhone('+8613800138000', '123456');

      expect(ok, isTrue);
      expect(provider.isAuthenticated, isTrue);
    });

    test('失败 → 返回 false', () async {
      when(() => authRepository.loginPhone(any(), any()))
          .thenThrow(Exception('手机号未注册'));

      final ok = await provider.loginPhone('+8613800138000', '123456');

      expect(ok, isFalse);
      expect(provider.error, isNotNull);
    });
  });

  group('sendSmsCode / bindPhone', () {
    test('sendSmsCode 成功返回 true', () async {
      when(() => authRepository.sendSmsCode('+8613800138000'))
          .thenAnswer((_) async => null);

      final ok = await provider.sendSmsCode('+8613800138000');

      expect(ok, isTrue);
    });

    test('bindPhone 成功返回 true', () async {
      when(() => authRepository.bindPhone('+8613800138000', '123456'))
          .thenAnswer((_) async => null);

      final ok = await provider.bindPhone('+8613800138000', '123456');

      expect(ok, isTrue);
    });
  });

  group('deactivate', () {
    test('成功 → 清 token 并 unauthenticated', () async {
      when(() => authRepository.deactivate('pass123'))
          .thenAnswer((_) async => null);
      when(() => apiClient.clearTokens()).thenAnswer((_) async => null);

      final ok = await provider.deactivate('pass123');

      expect(ok, isTrue);
      expect(provider.isAuthenticated, isFalse);
    });
  });

  group('exportData', () {
    test('成功 → 返回数据 map', () async {
      when(() => authRepository.exportData())
          .thenAnswer((_) async => {'profile': {'username': 'testuser'}});

      final data = await provider.exportData();

      expect(data, isNotNull);
      expect(data!['profile'], isNotNull);
    });

    test('失败 → 返回 null', () async {
      when(() => authRepository.exportData()).thenThrow(Exception('boom'));

      final data = await provider.exportData();

      expect(data, isNull);
    });
  });
}
