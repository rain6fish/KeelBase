// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/core/i18n/app_localizations.dart';
import 'package:front_app/core/services/app_cache.dart';
import 'package:front_app/features/auth/data/services/oauth_service.dart';
import 'package:front_app/features/auth/presentation/pages/login_page.dart';
import 'package:front_app/features/auth/presentation/providers/auth_provider.dart';
import 'package:front_app/features/auth/presentation/utils/oauth_error_text.dart';
import '../../helpers.dart';

class MockAppCache extends Mock implements AppCache {}

/// 按脚本抛错的替身 —— 本测试关心的是**错误怎么被表达**，不是真去走平台 SDK。
class _ThrowingOAuthService extends OAuthService {
  _ThrowingOAuthService(this._error);
  final Object _error;

  @override
  Future<OAuthResult> signInWithWeChat() async => throw _error;
}

void main() {
  final zh = AppLocalizations(const Locale('zh', 'CN'));
  final en = AppLocalizations(const Locale('en'));

  group('oauthErrorText：句子在 UI 侧说，数据层只给 key', () {
    test('两种语言各说各的', () {
      final e = OAuthException(OAuthErrorKey.cancelled);
      expect(oauthErrorText(zh, e), '已取消登录');
      expect(oauthErrorText(en, e), 'Sign-in cancelled');
    });

    test('英文取值里不出现汉字', () {
      for (final key in OAuthErrorKey.values) {
        final text = oauthErrorText(en, OAuthException(key, {'detail': 'x'}));
        expect(RegExp(r'[一-鿿]').hasMatch(text), isFalse, reason: 'en 的 $key 不该含汉字');
      }
    });

    test('detail 只在需要它的那类里插值', () {
      expect(
        oauthErrorText(zh, OAuthException(OAuthErrorKey.failed, {'detail': 'boom'})),
        '登录失败：boom',
      );
      expect(oauthErrorText(zh, OAuthException(OAuthErrorKey.failed)), '登录失败');
      // 其余 key 不吃 detail
      expect(
        oauthErrorText(zh, OAuthException(OAuthErrorKey.noCredential, {'detail': 'boom'})),
        '登录未返回凭据',
      );
    });

    test('异常本身不再携带拼好的句子（按 key 表达）', () {
      final e = OAuthException(OAuthErrorKey.sdkNotConfigured, {'sdk': 'fluwx'});
      expect(e.toString(), contains('sdkNotConfigured'));
      expect(e.toString(), isNot(contains('尚未配置')));
    });
  });

  group('loginErrorText：取消不算失败', () {
    late MockApiClient apiClient;
    late MockAuthRepository authRepository;
    late MockSplashRepository splashRepository;
    late MockAppCache cache;

    AuthProvider providerThrowing(Object error) => AuthProvider(
          authRepository: authRepository,
          splashRepository: splashRepository,
          apiClient: apiClient,
          cache: cache,
          oauthService: _ThrowingOAuthService(error),
        );

    setUp(() {
      apiClient = MockApiClient();
      authRepository = MockAuthRepository();
      splashRepository = MockSplashRepository();
      cache = MockAppCache();
      when(() => cache.clearAll()).thenAnswer((_) async {});
    });

    test('登录方式失败 → 由 key 译出文案', () async {
      final p = providerThrowing(OAuthException(OAuthErrorKey.nativeOnly));
      expect(await p.oauthLogin('wechat'), isFalse);
      expect(p.oauthError?.key, OAuthErrorKey.nativeOnly);
      expect(loginErrorText(p, zh), '此登录方式只能在手机 App 内使用');
      expect(loginErrorText(p, en), 'This sign-in method only works in the mobile app');
      p.dispose();
    });

    test('用户取消 → 不产生提示文案（key 那一路）', () async {
      final p = providerThrowing(OAuthException(OAuthErrorKey.cancelled));
      await p.oauthLogin('wechat');
      expect(loginErrorText(p, zh), isNull);
      p.dispose();
    });

    test('平台渠道取消（技术文本带 cancel）→ 同样不提示', () async {
      final p = providerThrowing(Exception('PlatformException(sign_in_canceled)'));
      await p.oauthLogin('wechat');
      expect(loginErrorText(p, zh), isNull);
      p.dispose();
    });

    test('其它技术文本原样透出（不吞）', () async {
      final p = providerThrowing(Exception('socket closed'));
      await p.oauthLogin('wechat');
      expect(loginErrorText(p, zh), contains('socket closed'));
      p.dispose();
    });

    test('没有失败 → null', () {
      final p = providerThrowing(Exception('x'));
      expect(loginErrorText(p, zh), isNull);
      p.dispose();
    });
  });
}
