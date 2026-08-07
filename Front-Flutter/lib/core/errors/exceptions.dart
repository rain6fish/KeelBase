class AuthException implements Exception {
  final String message;
  AuthException(this.message);

  @override
  String toString() => message;
}

class NetworkException implements Exception {
  final String message;
  NetworkException(this.message);

  @override
  String toString() => message;
}

class ValidationException implements Exception {
  final String message;
  ValidationException(this.message);

  @override
  String toString() => message;
}

/// Thrown when the server returns 429 with a retryAfter field.
class RateLimitException implements Exception {
  final String message;
  final int retryAfter;

  RateLimitException(this.message, this.retryAfter);

  @override
  String toString() => message;
}
