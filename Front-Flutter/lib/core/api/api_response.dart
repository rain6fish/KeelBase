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
      code: json['code'] as int,
      message: json['message'] as String,
      data: json['data'] != null && fromData != null
          ? fromData(json['data'])
          : null,
      timestamp: json['timestamp'] as String,
    );
  }
}

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
    return PaginatedData(
      items: (json['items'] as List?)?.map(fromItem).toList() ?? [],
      total: json['total'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 20,
    );
  }
}
