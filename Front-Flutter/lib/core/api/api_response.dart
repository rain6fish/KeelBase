// SPDX-License-Identifier: Apache-2.0

/// Server response envelope wrapper.
class ApiResponse<T> {
  final int code;
  final String message;
  final T? data;
  final String timestamp;

  ApiResponse({
    required this.code,
    required this.message,
    this.data,
    required this.timestamp,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic)? fromData,
  ) {
    return ApiResponse(
      code: _readInt(json, 'code'),
      message: _readString(json, 'message'),
      data: json['data'] != null && fromData != null
          ? fromData(json['data'])
          : null,
      timestamp: _readString(json, 'timestamp'),
    );
  }

  /// True when the server reported a successful envelope (code == 200).
  bool get isSuccess => code == 200;

  /// Returns the non-null payload, throwing a descriptive [StateError] when the
  /// envelope carried no `data` (e.g. the caller expected a payload but none
  /// was parsed). Use after confirming [isSuccess] to surface contract
  /// mismatches early instead of a confusing null-dereference downstream.
  T requireData() {
    final value = data;
    if (value == null) {
      throw StateError(
          'API response (code $code) carried no data payload, message: $message');
    }
    return value;
  }

  /// Returns the payload for a successful envelope, throwing a [StateError]
  /// when [isSuccess] is false. The returned payload may still be null; use
  /// [requireData] when a non-null body is expected.
  T? requireSuccess() {
    if (!isSuccess) {
      throw StateError('API response not successful: code $code, message: $message');
    }
    return data;
  }

  static int _readInt(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is int) return value;
    throw FormatException('API response field "$key" expected int, got: $value');
  }

  static String _readString(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is String) return value;
    throw FormatException(
        'API response field "$key" expected String, got: $value');
  }
}

/// Paginated list payload wrapper (`{ items, total, page, limit }`).
///
/// [total], [page] and [limit] are required by the API contract; missing or
/// wrongly-typed metadata fails loudly with a [FormatException] instead of
/// silently defaulting to a plausible-but-incorrect pagination state.
class PaginatedData<T> {
  final List<T> items;
  final int total;
  final int page;
  final int limit;

  PaginatedData({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory PaginatedData.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic) fromItem,
  ) {
    final rawItems = json['items'];
    final items = rawItems is List
        ? rawItems.expand<T>((item) {
            try {
              return <T>[fromItem(item)];
            } catch (_) {
              // Skip a single malformed record instead of aborting the whole
              // page — one bad item must not hide the remaining valid ones.
              return const <Never>[];
            }
          }).toList()
        : <T>[];
    return PaginatedData(
      items: items,
      total: ApiResponse._readInt(json, 'total'),
      page: ApiResponse._readInt(json, 'page'),
      limit: ApiResponse._readInt(json, 'limit'),
    );
  }
}
