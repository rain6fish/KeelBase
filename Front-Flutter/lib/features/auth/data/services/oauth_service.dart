// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'package:flutter/foundation.dart';
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
///   - Apple:     Identity token via sign_in_with_apple
///
/// ## China (Native only) — requires native SDK configuration
///   - WeChat:    authorization code via fluwx (需手动集成)
///   - Alipay:    authorization code via tobias (需手动集成)
///
/// ## Initialization
/// Call [init] once at app startup.
class OAuthService {
  // WeChat auth flow (used when fluwx is imported)
  StreamSubscription<dynamic>? _weChatAuthSub;
  Completer<String>? _weChatCompleter;

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
    // 防止 dispose 期间进行中的微信授权永久悬挂
    final completer = _weChatCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.completeError(
        OAuthException(OAuthErrorKey.failed, {'detail': 'OAuthService disposed during WeChat auth'}),
      );
    }
    _weChatCompleter = null;
  }

  // ─── International ──────────────────────────────────────────────────────

  Future<OAuthResult> signInWithApple() async {
    final available = await isAppleSignInAvailable();
    if (!available) {
      throw OAuthException(
        kIsWeb ? OAuthErrorKey.notAvailableBrowser : OAuthErrorKey.notAvailableDevice,
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
        throw OAuthException(OAuthErrorKey.noCredential);
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
        authorizationCode: credential.authorizationCode,
        displayName: displayName,
        email: credential.email,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw OAuthException(OAuthErrorKey.cancelled);
      }
      throw OAuthException(OAuthErrorKey.failed, {'detail': e.message});
    } on TypeError catch (e) {
      throw OAuthException(OAuthErrorKey.notAvailableBrowser, {'detail': '$e'});
    } catch (e) {
      throw OAuthException(OAuthErrorKey.failed, {'detail': '$e'});
    }
  }

  // ─── WeChat (via fluwx) ─────────────────────────────────────────────

  Future<OAuthResult> signInWithWeChat() async {
    if (kIsWeb) throw OAuthException(OAuthErrorKey.nativeOnly);

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
      throw OAuthException(OAuthErrorKey.failed, {'detail': '$e'});
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
    // 联调步骤（原先把它们拼进给用户看的文案里，已移到注释）：取消顶部 import fluwx 的注释，
    // 并实现 _fluwxRegister() 与 _fluwxSendAuth() 中的调用。
    throw OAuthException(OAuthErrorKey.sdkNotConfigured, {'sdk': 'fluwx'});
  }

  // ─── Alipay (via tobias) ─────────────────────────────────────────────

  Future<OAuthResult> signInWithAlipay() async {
    if (kIsWeb) throw OAuthException(OAuthErrorKey.nativeOnly);

    try {
      final result = await _alipayAuth();
      if (result.resultCode == '9000') {
        final authCode = result.authCode as String?;
        if (authCode == null || authCode.isEmpty) {
          throw OAuthException(OAuthErrorKey.noCredential);
        }
        return OAuthResult(
          provider: 'alipay',
          idToken: '',
          authorizationCode: authCode,
        );
      } else if (result.resultCode == '6001') {
        throw OAuthException(OAuthErrorKey.cancelled);
      } else {
        throw OAuthException(
          OAuthErrorKey.failed,
          {'detail': result.memo ?? 'code=${result.resultCode}'},
        );
      }
    } on OAuthException {
      rethrow;
    } catch (e) {
      throw OAuthException(OAuthErrorKey.failed, {'detail': '$e'});
    }
  }

  /// Alipay auth call — fill in when tobias is imported.
  Future<dynamic> _alipayAuth() async {
    // TODO: 集成 tobias 后替换为: return await tobias.auth();
    // v2: tobias.auth() → AuthResult { resultCode, authCode, memo }
    // v3: API may differ — check installed version.
    // 联调步骤（原先把它们拼进给用户看的文案里，已移到注释）：取消顶部 import tobias 的注释，
    // 并实现 _alipayAuth() 中的调用。
    throw OAuthException(OAuthErrorKey.sdkNotConfigured, {'sdk': 'tobias'});
  }

  // ─── Platform checks ──────────────────────────────────────────────────

  Future<bool> isAppleSignInAvailable() async {
    try {
      return await SignInWithApple.isAvailable();
    } catch (_) {
      return false;
    }
  }

  Future<bool> isWeChatInstalled() async {
    // TODO: 集成 fluwx 后替换为: return await fluwx.isWeChatInstalled;
    return false;
  }
}

/// Custom exception for OAuth errors.
class OAuthException implements Exception {
  /// 失败的种类（稳定标识）。文案在 UI 侧用 [AppLocalizations] 生成 —— 这一层没有
  /// BuildContext，所以它只给 key、不给句子（见 `presentation/utils/oauth_error_text.dart`）。
  final OAuthErrorKey key;

  /// 插值参数（如底层原因 `detail`、方式名 `provider`），键名与 UI 侧约定一致。
  final Map<String, String> params;

  OAuthException(this.key, [this.params = const {}]);

  @override
  String toString() => 'OAuthException(${key.name}${params.isEmpty ? '' : ' $params'})';
}

/// 登录方式失败的稳定种类。
///
/// 刻意**不带提供商的显示名**：那个名字在 UI 侧来自后端（`OAuthProviderConfig.fromJson`），
/// 在这里再写一份中文名会变成第二个来源。按钮本身已经说明了是哪一个，句子照常说。
///
/// Deliberately carries no provider display name: that name comes from the backend on the UI side,
/// and a second copy here would be a second source. The button already says which one it is.
enum OAuthErrorKey {
  /// 该方式只能在原生 App 内使用（Web 上不可用）。
  nativeOnly,
  /// 该方式在这个浏览器里不可用（需要 Safari 或原生设备）。
  notAvailableBrowser,
  /// 该方式在这台设备上不可用。
  notAvailableDevice,
  /// 用户主动取消。
  cancelled,
  /// 提供方没有返回凭据（授权码 / identity token）。
  noCredential,
  /// 该方式的原生 SDK 尚未配置（联调期）。
  sdkNotConfigured,
  /// 本端未实现的登录方式。
  unsupportedProvider,
  /// 其余失败；`detail` 带底层原因。
  failed,
}
