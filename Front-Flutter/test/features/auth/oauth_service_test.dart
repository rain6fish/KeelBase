// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mocktail/mocktail.dart';
import 'package:front_app/features/auth/data/services/oauth_service.dart';

class MockGoogleSignIn extends Mock implements GoogleSignIn {}

class MockGoogleSignInAccount extends Mock implements GoogleSignInAccount {}

class MockGoogleSignInAuthentication extends Mock
    implements GoogleSignInAuthentication {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockGoogleSignIn gs;
  late MockGoogleSignInAccount account;
  late MockGoogleSignInAuthentication auth;

  setUp(() {
    gs = MockGoogleSignIn();
    account = MockGoogleSignInAccount();
    auth = MockGoogleSignInAuthentication();
    when(() => gs.scopes).thenReturn(const <String>[]);
  });

  OAuthService serviceWithGoogle() =>
      OAuthService(googleClientId: 'client-id', googleSignIn: gs);

  group('isGoogleSignInAvailable', () {
    test('配置了 clientId 时可用', () {
      expect(serviceWithGoogle().isGoogleSignInAvailable, isTrue);
    });

    test('未配置 clientId 时不可用', () {
      expect(OAuthService().isGoogleSignInAvailable, isFalse);
    });
  });

  group('signInWithGoogle', () {
    test('成功返回 OAuthResult', () async {
      when(() => gs.signIn()).thenAnswer((_) async => account);
      when(() => account.authentication).thenAnswer((_) async => auth);
      when(() => auth.idToken).thenReturn('id-token-1');
      when(() => account.displayName).thenReturn('Rain');
      when(() => account.email).thenReturn('rain@example.com');

      final result = await serviceWithGoogle().signInWithGoogle();

      expect(result.provider, 'google');
      expect(result.idToken, 'id-token-1');
      expect(result.displayName, 'Rain');
      expect(result.email, 'rain@example.com');
    });

    test('用户取消抛 OAuthException', () async {
      when(() => gs.signIn()).thenAnswer((_) async => null);

      expect(
        () => serviceWithGoogle().signInWithGoogle(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('cancelled'))),
      );
    });

    test('拿不到 idToken 抛 OAuthException', () async {
      when(() => gs.signIn()).thenAnswer((_) async => account);
      when(() => account.authentication).thenAnswer((_) async => auth);
      when(() => auth.idToken).thenReturn(null);

      expect(
        () => serviceWithGoogle().signInWithGoogle(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('Google ID token'))),
      );
    });
  });

  group('signInWithWeChat', () {
    test('未集成 fluwx 抛 OAuthException', () async {
      expect(
        () => serviceWithGoogle().signInWithWeChat(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('fluwx'))),
      );
    });
  });

  group('signInWithAlipay', () {
    test('未集成 tobias 抛 OAuthException', () async {
      expect(
        () => serviceWithGoogle().signInWithAlipay(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('tobias'))),
      );
    });
  });

  test('isWeChatInstalled 返回 false（未集成）', () async {
    expect(await serviceWithGoogle().isWeChatInstalled(), isFalse);
  });

  test('isAppleSignInAvailable 在测试环境返回 false', () async {
    expect(await serviceWithGoogle().isAppleSignInAvailable(), isFalse);
  });

  test('init 带 weChatAppId 不抛异常', () async {
    await serviceWithGoogle().init(weChatAppId: 'wx-app-id');
    await serviceWithGoogle().init();
  });
}
