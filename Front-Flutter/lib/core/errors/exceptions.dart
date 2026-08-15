/// Base class for all app domain exceptions.
///
/// Keeps the wrapped [cause] and [stackTrace] when available so chained
/// errors can be diagnosed in production instead of being lost once wrapped.
abstract class AppException implements Exception {
  final String message;
  final Object? cause;
  final StackTrace? stackTrace;

  AppException(this.message, {this.cause, this.stackTrace});

  @override
  String toString() => message;
}

class AuthException extends AppException {
  AuthException(super.message, {super.cause, super.stackTrace});
}

class NetworkException extends AppException {
  NetworkException(super.message, {super.cause, super.stackTrace});
}

class ValidationException extends AppException {
  ValidationException(super.message, {super.cause, super.stackTrace});
}

/// Thrown when the server returns 429 with a retryAfter field.
class RateLimitException extends AppException {
  /// Seconds until the client should retry. `0` means "retry now".
  ///
  /// Always non-negative: a malformed/misbehaving server sending a negative
  /// value is clamped to `0` so backoff logic never runs a negative countdown.
  final int retryAfter;

  RateLimitException(super.message, int retryAfter,
      {super.cause, super.stackTrace})
      : retryAfter = retryAfter < 0 ? 0 : retryAfter;

  @override
  String toString() => message;
}
