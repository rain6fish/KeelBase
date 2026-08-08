import 'package:dio/dio.dart';
import '../constants/app_constants.dart';
import '../errors/exceptions.dart';
import '../security/secure_storage_service.dart';

/// Dio-based HTTP client with JWT interceptor and auto-refresh.
class ApiClient {
  late final Dio _dio;
  final SecureStorageService _storage;

  /// Function to call when auth fails (refresh fails) — set by app.
  Future<void> Function()? onAuthFailure;

  String? _accessToken;

  /// Guard against re-entrant auth failure handling (e.g. logout → 401 → onAuthFailure → logout → …)
  bool _isHandlingAuthFailure = false;

  /// Persistent device identifier for rate limiting.
  String? deviceId;

  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.activeBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_accessToken != null) {
          options.headers['Authorization'] = 'Bearer $_accessToken';
        }
        if (deviceId != null) {
          options.headers['X-Device-Id'] = deviceId;
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Prevent recursive loop: logout → 401 → onAuthFailure → logout → …
          if (_isHandlingAuthFailure) {
            handler.next(error);
            return;
          }
          _isHandlingAuthFailure = true;
          try {
            final refreshed = await _tryRefreshToken();
            if (refreshed) {
              // Retry the original request
              final retryOptions = error.requestOptions;
              if (_accessToken != null) {
                retryOptions.headers['Authorization'] = 'Bearer $_accessToken';
              }
              try {
                final response = await _dio.fetch(retryOptions);
                handler.resolve(response);
                return;
              } catch (e) {
                handler.next(error);
                return;
              }
            } else {
              if (onAuthFailure != null) {
                await onAuthFailure!();
              }
            }
          } finally {
            _isHandlingAuthFailure = false;
          }
        }
        handler.next(error);
      },
    ));
  }

  /// Store tokens after login/register/refresh.
  Future<void> setTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessToken = accessToken;
    await _storage.write(AppConstants.keyRefreshToken, refreshToken);
  }

  /// Clear tokens on logout.
  Future<void> clearTokens() async {
    _accessToken = null;
    await _storage.delete(AppConstants.keyRefreshToken);
  }

  /// Get current access token (for auth state check).
  String? get accessToken => _accessToken;

  /// Get refresh token from secure storage.
  Future<String?> get refreshToken => _storage.read(AppConstants.keyRefreshToken);

  /// Try to refresh access token using stored refresh token.
  Future<bool> _tryRefreshToken() async {
    try {
      final rt = await _storage.read(AppConstants.keyRefreshToken);
      if (rt == null) return false;

      final response = await Dio(BaseOptions(baseUrl: AppConstants.activeBaseUrl)).post(
        '/auth/refresh',
        data: {'refreshToken': rt},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data['data'];
        if (data != null) {
          await setTokens(
            accessToken: data['accessToken'] as String,
            refreshToken: data['refreshToken'] as String,
          );
          return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // --- HTTP methods ---

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.get(path, queryParameters: queryParameters);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.post(path, data: data, queryParameters: queryParameters);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.put(path, data: data, queryParameters: queryParameters);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await _dio.patch(path, data: data, queryParameters: queryParameters);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> delete(String path) async {
    try {
      final response = await _dio.delete(path);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Upload a file via multipart/form-data.
  Future<Map<String, dynamic>> uploadFile(String filePath, String fileName) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      });
      final response = await _dio.post('/upload', data: formData);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Exception _handleError(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return NetworkException('Connection timeout');
    }
    if (e.type == DioExceptionType.connectionError) {
      return NetworkException('No internet connection');
    }
    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    final message = data is Map ? data['message'] as String? : null;

    if (statusCode == 429 || (data is Map && data['retryAfter'] != null)) {
      final retryAfter = data is Map ? (data['retryAfter'] as num?)?.toInt() ?? 0 : 0;
      return RateLimitException(message ?? 'Too many attempts', retryAfter);
    }
    if (statusCode == 401) {
      return AuthException(message ?? 'Unauthorized');
    }
    if (statusCode == 403) {
      return AuthException(message ?? 'Forbidden');
    }
    return NetworkException(message ?? 'Unknown error');
  }
}
