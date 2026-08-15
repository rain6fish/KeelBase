import 'package:dio/dio.dart';
import '../constants/app_constants.dart';
import '../errors/exceptions.dart';
import '../security/secure_storage_service.dart';

/// Dio-based HTTP client with JWT interceptor and auto-refresh.
class ApiClient {
  /// Marker set on a retried request so a second 401 on the retry does not
  /// start another refresh cycle (infinite loop guard).
  static const String _authRetriedKey = 'auth_retried';

  /// Path of the token-refresh endpoint — its own 401 must never trigger
  /// another refresh.
  static const String _refreshPath = '/auth/refresh';

  late final Dio _dio;
  final SecureStorageService _storage;

  /// Function to call when auth fails (refresh fails) — set by app.
  Future<void> Function()? onAuthFailure;

  String? _accessToken;

  /// Guards re-entrant auth-failure handling (e.g. logout → 401 → onAuthFailure → logout → …).
  bool _isHandlingAuthFailure = false;

  /// Single-flight refresh future: concurrent 401s await this instead of
  /// racing their own refresh calls.
  Future<bool>? _refreshFuture;

  /// Persistent device identifier for rate limiting.
  String? deviceId;

  ApiClient(this._storage, {Dio? dio}) {
    _dio = dio ??
        Dio(BaseOptions(
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
        if (error.response?.statusCode != 401) {
          handler.next(error);
          return;
        }
        // 刷新请求自身 401：不再次刷新，直接失败。
        if (error.requestOptions.path == _refreshPath) {
          handler.next(error);
          return;
        }
        // 重试过的请求再次 401：新 token 也无效，直接失败，防止无限刷新循环。
        if (error.requestOptions.extra[_authRetriedKey] == true) {
          handler.next(error);
          return;
        }
        // 正在处理登录失效（logout 流程）时，不再发起新的刷新。
        if (_isHandlingAuthFailure) {
          handler.next(error);
          return;
        }

        try {
          final refreshed = await _refreshSingleFlight();
          if (refreshed) {
            // 用新 token 重试原请求。
            final retryOptions = error.requestOptions
              ..extra[_authRetriedKey] = true;
            if (_accessToken != null) {
              retryOptions.headers['Authorization'] = 'Bearer $_accessToken';
            }
            try {
              final response = await _dio.fetch(retryOptions);
              handler.resolve(response);
              return;
            } on DioException catch (retryError) {
              // 传播重试的真实错误，而不是原始 401（掩盖真实原因）。
              handler.next(retryError);
              return;
            }
          } else {
            // refresh token 无效/被吊销 → 触发全局登录失效（仅此一次）。
            if (!_isHandlingAuthFailure) {
              _isHandlingAuthFailure = true;
              try {
                await onAuthFailure?.call();
              } catch (_) {
                // 登录失效回调自身失败也不能让原请求悬而未决。
              } finally {
                _isHandlingAuthFailure = false;
              }
            }
            handler.next(error);
            return;
          }
        } catch (refreshError) {
          // 刷新遇传输/超时/5xx 等瞬时错误：不是 token 失效，绝不动用
          // onAuthFailure（否则瞬断网络会误登出用户）。用 DioException 包裹
          // NetworkException 走 Dio 错误链，_handleError 会原样解包返回。
          if (refreshError is NetworkException) {
            handler.next(DioException(
              requestOptions: error.requestOptions,
              type: DioExceptionType.unknown,
              error: refreshError,
            ));
          } else {
            handler.next(error);
          }
          return;
        }
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

  /// Single-flight refresh: concurrent callers share one in-flight future.
  Future<bool> _refreshSingleFlight() {
    final inFlight = _refreshFuture;
    if (inFlight != null) return inFlight;
    Future<bool>? created;
    created = _doRefresh().whenComplete(() {
      if (identical(_refreshFuture, created)) _refreshFuture = null;
    });
    _refreshFuture = created;
    return created;
  }

  /// Refresh access token using the stored refresh token.
  ///
  /// Returns `false` only when the refresh token is genuinely invalid/revoked
  /// (HTTP 400/401 from `/auth/refresh`). Transport/timeout/5xx failures throw
  /// a [NetworkException] so the interceptor does NOT log the user out on
  /// transient network problems.
  Future<bool> _doRefresh() async {
    final rt = await _storage.read(AppConstants.keyRefreshToken);
    if (rt == null) return false;

    try {
      // 复用主 client 的 Dio：继承其超时配置，避免刷新请求无限挂起。
      final response = await _dio.post(
        _refreshPath,
        data: {'refreshToken': rt},
      );

      if (response.statusCode != 200 && response.statusCode != 201) {
        return false;
      }

      final data = response.data;
      if (data is Map && data['data'] is Map) {
        final inner = data['data'] as Map;
        final access = inner['accessToken'];
        final refresh = inner['refreshToken'];
        if (access is String && refresh is String) {
          await setTokens(accessToken: access, refreshToken: refresh);
          return true;
        }
      }
      return false;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status != null && status >= 400 && status < 500 && status != 429) {
        // 400/401/403 → refresh token 无效/被吊销。
        return false;
      }
      // 瞬时网络错误 / 5xx → 不是认证失败。
      throw NetworkException(
        'Failed to refresh session',
        cause: e,
        stackTrace: e.stackTrace,
      );
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
    final FormData formData;
    try {
      formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      });
    } catch (e, stackTrace) {
      // MultipartFile.fromFile 可能抛非 Dio 异常（如文件不存在），包装成领域异常。
      throw NetworkException(
        'Failed to read file for upload',
        cause: e,
        stackTrace: stackTrace,
      );
    }
    try {
      final response = await _dio.post('/upload', data: formData);
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Exception _handleError(DioException e) {
    // 刷新阶段包装的 NetworkException 原样解包（见 onError 刷新 catch 分支）。
    if (e.error is NetworkException) return e.error as NetworkException;
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return NetworkException('Connection timeout');
    }
    if (e.type == DioExceptionType.connectionError) {
      return NetworkException('No internet connection');
    }
    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    // 安全取 message / retryAfter，避免服务端返回异常类型时抛裸 TypeError。
    final message = data is Map && data['message'] is String
        ? data['message'] as String
        : null;
    final retryAfter = data is Map && data['retryAfter'] is num
        ? (data['retryAfter'] as num).toInt()
        : 0;

    if (statusCode == 429 || (data is Map && data['retryAfter'] != null)) {
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
