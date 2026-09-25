// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/auth/data/services/oauth_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  OAuthService service() => OAuthService();

  group('signInWithWeChat', () {
    test('未集成 fluwx 抛 OAuthException', () async {
      expect(
        () => service().signInWithWeChat(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('fluwx'))),
      );
    });
  });

  group('signInWithAlipay', () {
    test('未集成 tobias 抛 OAuthException', () async {
      expect(
        () => service().signInWithAlipay(),
        throwsA(isA<OAuthException>().having((e) => e.message, 'message', contains('tobias'))),
      );
    });
  });

  test('isWeChatInstalled 返回 false（未集成）', () async {
    expect(await service().isWeChatInstalled(), isFalse);
  });

  test('isAppleSignInAvailable 在测试环境返回 false', () async {
    expect(await service().isAppleSignInAvailable(), isFalse);
  });

  test('init 带 weChatAppId 不抛异常', () async {
    await service().init(weChatAppId: 'wx-app-id');
    await service().init();
  });
}
