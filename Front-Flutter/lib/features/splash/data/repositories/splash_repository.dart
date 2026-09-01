// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';

/// Repository for splash-screen initialization logic.
class SplashRepository {
  final ApiClient _apiClient;

  SplashRepository(this._apiClient);

  /// Check if a refresh token exists (indicates prior login).
  Future<bool> hasStoredToken() async {
    final rt = await _apiClient.refreshToken;
    return rt != null;
  }
}
