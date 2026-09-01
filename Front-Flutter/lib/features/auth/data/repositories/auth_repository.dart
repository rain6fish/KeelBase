// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/errors/exceptions.dart';
import '../models/token_model.dart';
import '../models/user_model.dart';

class AuthRepository {
  final ApiClient _client;

  AuthRepository(this._client);

  /// 解析统一响应并校验业务 code；code != 0 或 data 为空时抛 [AuthException]。
  T _unwrapData<T>(Map<String, dynamic> json, T Function(dynamic) fromData) {
    final response = ApiResponse<T>.fromJson(json, fromData);
    if (response.code != 0 || response.data == null) {
      throw AuthException(response.message);
    }
    return response.data!;
  }

  /// 校验统一响应业务 code（无 data 的 void 接口用），失败抛 [AuthException]。
  void _requireSuccess(Map<String, dynamic> json) {
    final response = ApiResponse<dynamic>.fromJson(json, (data) => data);
    if (response.code != 0) {
      throw AuthException(response.message);
    }
  }

  String _deviceName() {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'Android';
      case TargetPlatform.iOS:
        return 'iPhone';
      case TargetPlatform.macOS:
        return 'Mac';
      case TargetPlatform.windows:
        return 'Windows';
      case TargetPlatform.linux:
        return 'Linux';
      default:
        return 'Web';
    }
  }

  Future<TokenModel> login(String username, String password) async {
    final json = await _client.post('/auth/login', data: {
      'username': username,
      'password': password,
      'deviceName': _deviceName(),
    });
    return _unwrapData(json, (data) => TokenModel.fromJson(data));
  }

  Future<TokenModel> register({
    required String username,
    required String email,
    required String password,
    required String nickname,
    String? firstName,
    String? lastName,
    String? dateOfBirth,
    String? phone,
  }) async {
    final json = await _client.post('/auth/register', data: {
      'username': username,
      'email': email,
      'password': password,
      'nickname': nickname,
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
      if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
      if (phone != null) 'phone': phone,
    });
    return _unwrapData(json, (data) => TokenModel.fromJson(data));
  }

  /// OAuth login with a provider credential.
  ///
  /// - **idToken**: Used by Google / Apple (JWT format)
  /// - **authorizationCode**: Used by WeChat / Alipay / QQ
  ///
  /// The backend verifies the credential and either links the provider to an
  /// existing account or automatically creates a new one (免注册).
  Future<TokenModel> oauthLogin({
    required String provider,
    String? idToken,
    String? authorizationCode,
    String? clientId,
    String? redirectUri,
  }) async {
    // 至少提供一个凭证，避免无谓的服务器往返后才失败
    if (idToken == null && authorizationCode == null) {
      throw ArgumentError('Either idToken or authorizationCode must be provided');
    }
    final json = await _client.post('/auth/oauth', data: {
      'provider': provider,
      if (idToken != null) 'idToken': idToken,
      if (authorizationCode != null) 'authorizationCode': authorizationCode,
      if (clientId != null) 'clientId': clientId,
      if (redirectUri != null) 'redirectUri': redirectUri,
    });
    return _unwrapData(json, (data) => TokenModel.fromJson(data));
  }

  Future<UserModel> getProfile() async {
    final json = await _client.get('/auth/me');
    return _unwrapData(json, (data) => UserModel.fromJson(data));
  }

  /// 忘记密码：请求发送重置邮件（后端统一响应，防枚举）
  Future<void> requestPasswordReset(String email) async {
    final json = await _client.post('/auth/forgot-password', data: {'email': email});
    _requireSuccess(json);
  }

  /// 重置密码（token 来自邮件链接）
  Future<void> resetPassword(String token, String newPassword) async {
    final json = await _client.post('/auth/reset-password', data: {
      'token': token,
      'newPassword': newPassword,
    });
    _requireSuccess(json);
  }

  /// 邮箱验证：提交 6 位验证码
  Future<void> verifyEmail(String email, String code) async {
    final json = await _client.post('/auth/verify-email', data: {
      'email': email,
      'code': code,
    });
    _requireSuccess(json);
  }

  /// 重新发送邮箱验证码（后端统一响应，防枚举）
  Future<void> resendVerification(String email) async {
    final json = await _client.post('/auth/resend-verification', data: {
      'email': email,
    });
    _requireSuccess(json);
  }

  Future<void> logout() async {
    try {
      await _client.post('/auth/logout');
    } catch (e) {
      // 撤销 token 失败非致命，但记录以便排查（否则客户端误以为后端会话已清除）
      debugPrint('AuthRepository.logout failed (non-fatal): $e');
    }
  }

  /// 发送短信验证码（后端统一响应，防枚举）
  Future<void> sendSmsCode(String phone) async {
    final json = await _client.post('/auth/send-sms-code', data: {'phone': phone});
    _requireSuccess(json);
  }

  /// 绑定/更新手机号（校验验证码）
  Future<void> bindPhone(String phone, String code) async {
    final json = await _client.post('/auth/bind-phone', data: {'phone': phone, 'code': code});
    _requireSuccess(json);
  }

  /// 手机号 + 验证码登录
  Future<TokenModel> loginPhone(String phone, String code) async {
    final json = await _client.post('/auth/login-phone', data: {
      'phone': phone,
      'code': code,
      'deviceName': _deviceName(),
    });
    return _unwrapData(json, (data) => TokenModel.fromJson(data));
  }

  /// 自助注销账号（密码确认）
  Future<void> deactivate(String password) async {
    final json = await _client.post('/auth/deactivate', data: {'password': password});
    _requireSuccess(json);
  }

  /// 导出本人全量数据
  Future<Map<String, dynamic>> exportData() async {
    final json = await _client.get('/auth/export-data');
    final response = ApiResponse<Map<String, dynamic>?>.fromJson(
      json,
      (data) => data is Map<String, dynamic> ? Map<String, dynamic>.from(data) : null,
    );
    if (response.code != 0 || response.data == null) {
      throw AuthException(response.message);
    }
    return response.data!;
  }
}
