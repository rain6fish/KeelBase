// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/user_model.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/services/oauth_service.dart';
import '../../data/services/oauth_providers.dart';
import '../../../splash/data/repositories/splash_repository.dart';

enum AuthStatus { initial, authenticated, unauthenticated, loading, error }

class AuthProvider extends ChangeNotifier {
  final AuthRepository authRepository;
  final ApiClient apiClient;
  final OAuthService oauthService;
  AuthStatus _status = AuthStatus.initial;
  UserModel? _user;
  String? _error;
  int _cooldownRemaining = 0;
  Timer? _cooldownTimer;
  OAuthProviderConfig _providerConfig = OAuthProviderConfig.defaults();
  final AppCache _cache;

  AuthProvider({
    required this.authRepository,
    required SplashRepository splashRepository,
    required this.apiClient,
    OAuthService? oauthService,
    String? googleClientId,
    AppCache? cache,
  })  : oauthService = oauthService ?? OAuthService(googleClientId: googleClientId),
        _cache = cache ?? AppCache.unavailable();

  AuthStatus get status => _status;
  UserModel? get user => _user;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  int get cooldownRemaining => _cooldownRemaining;
  OAuthProviderConfig get providerConfig => _providerConfig;

  /// Fetch the list of enabled OAuth providers from the backend.
  Future<void> fetchProviderConfig() async {
    try {
      final json = await apiClient.get('/auth/oauth/providers');
      // Backend wraps response in { code, message, data, timestamp }
      final response = ApiResponse.fromJson(json, (d) => d as Map<String, dynamic>);
      _providerConfig = OAuthProviderConfig.fromJson(response.data!);
      // If backend returned empty lists (no credentials configured), fall back
      // to static defaults so the login page at least shows available options.
      if (_providerConfig.isEmpty) {
        _providerConfig = OAuthProviderConfig.defaults();
      }
    } catch (_) {
      // Fall back to static defaults if backend is unreachable
      _providerConfig = OAuthProviderConfig.defaults();
    }
    notifyListeners();
  }

  Future<void> tryAutoLogin() async {
    _status = AuthStatus.loading;
    notifyListeners();

    final rt = await apiClient.refreshToken;
    if (rt == null) {
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }

    try {
      final user = await authRepository.getProfile();
      _user = user;
      _status = AuthStatus.authenticated;
    } on AuthException {
      // 认证被明确拒绝（token 失效/被拒）才清除会话
      await apiClient.clearTokens();
      _user = null;
      _status = AuthStatus.unauthenticated;
    } catch (e) {
      // 网络瞬断/服务端 5xx 等临时错误：保留 token，下次启动可再尝试自动登录
      _error = e.toString();
      _status = AuthStatus.error;
    }
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    _status = AuthStatus.loading;
    _error = null;
    _cooldownRemaining = 0;
    _cooldownTimer?.cancel();
    notifyListeners();

    try {
      final tokens = await authRepository.login(username, password);
      await apiClient.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      _user = tokens.user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on RateLimitException catch (e) {
      _cooldownRemaining = e.retryAfter;
      _error = e.message;
      _status = AuthStatus.error;
      notifyListeners();
      _startCooldownTimer();
      return false;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 手机号 + 验证码登录
  Future<bool> loginPhone(String phone, String code) async {
    _status = AuthStatus.loading;
    _error = null;
    _cooldownRemaining = 0;
    _cooldownTimer?.cancel();
    notifyListeners();
    try {
      final tokens = await authRepository.loginPhone(phone, code);
      await apiClient.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      _user = tokens.user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on RateLimitException catch (e) {
      _cooldownRemaining = e.retryAfter;
      _error = e.message;
      _status = AuthStatus.error;
      notifyListeners();
      _startCooldownTimer();
      return false;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 发送短信验证码（防枚举统一响应）
  Future<bool> sendSmsCode(String phone) async {
    try {
      await authRepository.sendSmsCode(phone);
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 绑定/更新手机号
  Future<bool> bindPhone(String phone, String code) async {
    try {
      await authRepository.bindPhone(phone, code);
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 自助注销账号（密码确认）
  Future<bool> deactivate(String password) async {
    try {
      await authRepository.deactivate(password);
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
    // 后端已注销账号：即使清理本地 token 失败也要重置本地状态
    try {
      await apiClient.clearTokens();
    } catch (_) {}
    // 清离线缓存，防账号残留数据（CR-12）
    await _cache.clearAll();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
    return true;
  }

  /// 导出本人全量数据
  Future<Map<String, dynamic>?> exportData() async {
    try {
      return await authRepository.exportData();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  /// 忘记密码：请求发送重置邮件（后端统一响应，无论邮箱是否存在均成功）
  Future<bool> requestPasswordReset(String email) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    try {
      await authRepository.requestPasswordReset(email);
      // 强制置为未认证时同步清空本地会话，避免下次自动登录恢复旧会话
      try {
        await apiClient.clearTokens();
      } catch (_) {}
      _user = null;
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 重置密码（token 来自邮件链接）
  Future<bool> resetPassword(String token, String newPassword) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    try {
      await authRepository.resetPassword(token, newPassword);
      // 密码已重置，旧会话失效：清空本地会话，避免下次自动登录恢复旧账号
      try {
        await apiClient.clearTokens();
      } catch (_) {}
      _user = null;
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 邮箱验证：提交验证码，成功后刷新本地用户状态
  Future<bool> verifyEmail(String email, String code) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    try {
      await authRepository.verifyEmail(email, code);
      if (_user != null && _user!.email == email) {
        _user = _user!.copyWith(emailVerified: true);
        _status = AuthStatus.authenticated;
      } else {
        // 无匹配的登录用户时不得强行置为已认证，保持未登录态
        _status = AuthStatus.unauthenticated;
      }
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  /// 重新发送邮箱验证码（后端统一响应，防枚举）
  Future<bool> resendVerification(String email) async {
    _error = null;
    notifyListeners();

    try {
      await authRepository.resendVerification(email);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// OAuth login — auto-creates account if new.
  ///
  /// Supported providers:
  ///   idToken flow: google, apple
  ///   code flow:    wechat, alipay
  ///
  /// Returns `true` on success, `false` on failure.
  Future<bool> oauthLogin(String provider) async {
    _status = AuthStatus.loading;
    _error = null;
    _cooldownRemaining = 0;
    _cooldownTimer?.cancel();
    notifyListeners();

    try {
      // 1. Perform platform sign-in → get OAuthResult
      final OAuthResult result;
      switch (provider) {
        case 'google':
          result = await oauthService.signInWithGoogle();
          break;
        case 'apple':
          result = await oauthService.signInWithApple();
          break;
        case 'wechat':
          result = await oauthService.signInWithWeChat();
          break;
        case 'alipay':
          result = await oauthService.signInWithAlipay();
          break;
        default:
          throw OAuthException('不支持的登录方式: $provider');
      }

      // 2. Determine which credential to send
      final isCodeFlow = ['wechat', 'alipay'].contains(provider);
      final tokens = await authRepository.oauthLogin(
        provider: result.provider,
        idToken: isCodeFlow ? null : result.idToken,
        authorizationCode: isCodeFlow ? result.authorizationCode : null,
      );

      // 3. Store tokens and update state
      await apiClient.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      _user = tokens.user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on OAuthException catch (e) {
      _error = e.message;
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    } on RateLimitException catch (e) {
      _cooldownRemaining = e.retryAfter;
      _error = e.message;
      _status = AuthStatus.error;
      notifyListeners();
      _startCooldownTimer();
      return false;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  void _startCooldownTimer() {
    // 可取消的单例 Timer：避免并发倒计时循环以 2x/3x 速度跑完
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_cooldownRemaining <= 1) {
        timer.cancel();
        _cooldownRemaining = 0;
        notifyListeners();
      } else {
        _cooldownRemaining--;
        notifyListeners();
      }
    });
  }

  Future<bool> register({
    required String username,
    required String email,
    required String password,
    required String nickname,
    String? firstName,
    String? lastName,
    String? dateOfBirth,
    String? phone,
  }) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    try {
      final tokens = await authRepository.register(
        username: username,
        email: email,
        password: password,
        nickname: nickname,
        firstName: firstName,
        lastName: lastName,
        dateOfBirth: dateOfBirth,
        phone: phone,
      );
      await apiClient.setTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
      _user = tokens.user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _status = AuthStatus.error;
      notifyListeners();
      return false;
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<void> logout() async {
    if (_status == AuthStatus.unauthenticated) return;

    // Call backend logout FIRST while the JWT is still available
    try {
      await authRepository.logout();
    } catch (_) {
      // Backend error is fine — we're logging out regardless
    }

    // Then clear all local state in one shot
    await apiClient.clearTokens();
    // 清离线缓存，防跨账号数据泄漏（CR-12）
    await _cache.clearAll();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  void updateUser(UserModel updated) {
    _user = updated;
    notifyListeners();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }
}
