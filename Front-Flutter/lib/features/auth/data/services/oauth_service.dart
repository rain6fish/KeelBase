import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

// ── 国内原生 SDK 集成 ──────────────────────────────────────────────
//
// 微信 (fluwx) 和 支付宝 (tobias) 的集成需要取消注释下方的 import，
// 并根据实际安装的版本（v3 vs v4）调整对应的方法调用。
//
// 微信: 实现 _fluwxRegister(), _fluwxSendAuth(), _onWeChatResponse()
// 支付宝: 实现 _alipayAuth()
//
// import 'package:fluwx/fluwx.dart' as fluwx;
// import 'package:tobias/tobias.dart' as tobias;
// ────────────────────────────────────────────────────────────────────

/// Result of a successful OAuth sign-in.
class OAuthResult {
  final String provider;
  final String idToken;
  final String? authorizationCode;
  final String? displayName;
  final String? email;

  OAuthResult({
    required this.provider,
    required this.idToken,
    this.authorizationCode,
    this.displayName,
    this.email,
  });
}

/// Unified service for all OAuth providers.
///
/// ## International (Web / Native) — active out of the box
///   - Google:    ID token via google_sign_in
///   - Apple:     Identity token via sign_in_with_apple
///
/// ## China (Native only) — requires native SDK configuration
///   - WeChat:    authorization code via fluwx (需手动集成)
///   - Alipay:    authorization code via tobias (需手动集成)
///
/// ## Initialization
/// Call [init] once at app startup.
class OAuthService {
  final String? _googleClientId;
  GoogleSignIn? _googleSignIn;

  // WeChat auth flow (used when fluwx is imported)
  StreamSubscription<dynamic>? _weChatAuthSub;
  Completer<String>? _weChatCompleter;

  OAuthService({
    String? googleClientId,
    GoogleSignIn? googleSignIn,
  }) : _googleClientId = googleClientId,
       _googleSignIn = googleSignIn;

  // ─── Init ─────────────────────────────────────────────────────────────

  /// Call once at app startup to register native SDKs.
  Future<void> init({
    String? weChatAppId,
    String? weChatUniversalLink,
  }) async {
    // WeChat SDK init — implement when fluwx is imported
    if (weChatAppId != null) {
      await _fluwxRegister(weChatAppId, weChatUniversalLink);
    }
  }

  void dispose() {
    _weChatAuthSub?.cancel();
  }

  // ─── International ──────────────────────────────────────────────────────

  GoogleSignIn get _lazyGoogleSignIn {
    if (_googleSignIn == null) {
      _googleSignIn = GoogleSignIn(clientId: _googleClientId);
    }
    return _googleSignIn!;
  }

  Future<OAuthResult> signInWithGoogle({List<String>? scopes}) async {
    try {
      final gs = _lazyGoogleSignIn;
      await gs.signOut();
      final account = await gs.signIn();
      if (account == null) {
        throw OAuthException('Google sign-in cancelled by user');
      }
      final authentication = await account.authentication;
      final idToken = authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw OAuthException(
          'Failed to obtain Google ID token. '
          'Check that the Google Client ID is configured.',
        );
      }
      return OAuthResult(
        provider: 'google',
        idToken: idToken,
        displayName: account.displayName,
        email: account.email,
      );
    } on OAuthException {
      rethrow;
    } on ArgumentError catch (e) {
      throw OAuthException(
        'Google Sign-In is not configured. '
        'Set GOOGLE_CLIENT_ID or add a '
        '<meta name="google-signin-client_id"> tag to web/index.html.\n'
        'Detail: $e',
      );
    } catch (e) {
      throw OAuthException('Google sign-in failed: $e');
    }
  }

  Future<OAuthResult> signInWithApple() async {
    final available = await isAppleSignInAvailable();
    if (!available) {
      throw OAuthException(
        kIsWeb
            ? 'Apple Sign-In is not available in this browser. '
                'Please use Safari or try on an iOS/macOS device.'
            : 'Apple Sign-In is not available on this device.',
      );
    }
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );
      if (credential.identityToken == null ||
          credential.identityToken!.isEmpty) {
        throw OAuthException('Failed to obtain Apple identity token');
      }
      String? displayName;
      if (credential.givenName != null || credential.familyName != null) {
        displayName = [credential.givenName, credential.familyName]
            .where((n) => n != null && n.isNotEmpty)
            .join(' ');
      }
      return OAuthResult(
        provider: 'apple',
        idToken: credential.identityToken!,
        displayName: displayName,
        email: credential.email,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw OAuthException('Apple sign-in cancelled by user');
      }
      throw OAuthException('Apple sign-in failed: ${e.message}');
    } on TypeError catch (e) {
      throw OAuthException(
        'Apple Sign-In is not supported in this browser. '
        'Please use Safari or a native iOS/macOS device.\n'
        'Detail: $e',
      );
    } catch (e) {
      throw OAuthException('Apple sign-in failed: $e');
    }
  }

  // ─── WeChat (via fluwx) ─────────────────────────────────────────────

  Future<OAuthResult> signInWithWeChat() async {
    if (kIsWeb) throw OAuthException('微信登录需要在手机 App 中使用。');

    // Route through the helper which will throw until fluwx is configured
    try {
      final code = await _fluwxSendAuth();
      return OAuthResult(
        provider: 'wechat',
        idToken: '',
        authorizationCode: code,
      );
    } on OAuthException {
      rethrow;
    } catch (e) {
      throw OAuthException('微信登录失败: $e');
    }
  }

  // ── WeChat helper stubs (fill in when fluwx is imported) ──────────

  Future<void> _fluwxRegister(String appId, String? universalLink) async {
    // TODO: 集成 fluwx 后替换为:
    // await fluwx.registerWxApi(appId: appId, universalLink: universalLink);
    // _weChatAuthSub = fluwx.weChatResponseEventHandler...
    debugPrint('OAuthService: fluwx not imported — WeChat init skipped');
  }

  /// Returns the authorization code from WeChat.
  Future<String> _fluwxSendAuth() async {
    // TODO: 集成 fluwx 后替换为:
    // 1. await fluwx.sendWeChatAuth(scope: 'snsapi_userinfo', state: '...')
    // 2. Wait for response via _onWeChatResponse() completer
    throw OAuthException(
      '微信原生 SDK (fluwx) 尚未配置。\n'
      '联调时: (1) 取消顶部 import fluwx 的注释 '
      '(2) 实现 _fluwxRegister() 和 _fluwxSendAuth() 中的调用。',
    );
  }

  void _onWeChatResponse(dynamic resp) {
    // TODO: 集成 fluwx 后替换为:
    // if (resp.errCode == 0 && resp.code != null) _weChatCompleter!.complete(resp.code);
    // else if (resp.errCode == -2) ... completeError(OAuthException('取消'));
    // else ... completeError(OAuthException('失败'));
  }

  // ─── Alipay (via tobias) ─────────────────────────────────────────────

  Future<OAuthResult> signInWithAlipay() async {
    if (kIsWeb) throw OAuthException('支付宝登录需要在手机 App 中使用。');

    try {
      final result = await _alipayAuth();
      if (result.resultCode == '9000') {
        final authCode = result.authCode as String?;
        if (authCode == null || authCode.isEmpty) {
          throw OAuthException('支付宝授权码为空。');
        }
        return OAuthResult(
          provider: 'alipay',
          idToken: '',
          authorizationCode: authCode,
        );
      } else if (result.resultCode == '6001') {
        throw OAuthException('用户取消了支付宝登录');
      } else {
        throw OAuthException(
          '支付宝登录失败: ${result.memo ?? "code=${result.resultCode}"}',
        );
      }
    } on OAuthException {
      rethrow;
    } catch (e) {
      throw OAuthException('支付宝登录失败: $e');
    }
  }

  /// Alipay auth call — fill in when tobias is imported.
  Future<dynamic> _alipayAuth() async {
    // TODO: 集成 tobias 后替换为: return await tobias.auth();
    // v2: tobias.auth() → AuthResult { resultCode, authCode, memo }
    // v3: API may differ — check installed version.
    throw OAuthException(
      '支付宝原生 SDK (tobias) 尚未配置。\n'
      '联调时: (1) 取消顶部 import tobias 的注释 '
      '(2) 实现 _alipayAuth() 中的调用。',
    );
  }

  // ─── Platform checks ──────────────────────────────────────────────────

  Future<bool> isAppleSignInAvailable() async {
    try {
      return await SignInWithApple.isAvailable();
    } catch (_) {
      return false;
    }
  }

  bool get isGoogleSignInAvailable => true;

  Future<bool> isWeChatInstalled() async {
    // TODO: 集成 fluwx 后替换为: return await fluwx.isWeChatInstalled;
    return false;
  }
}

/// Custom exception for OAuth errors.
class OAuthException implements Exception {
  final String message;
  OAuthException(this.message);

  @override
  String toString() => 'OAuthException: $message';
}
