import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/errors/exceptions.dart';
import '../models/event_model.dart';

class EventsRepository {
  final ApiClient _client;

  EventsRepository(this._client);

  /// 后端统一响应以 HTTP 状态码作为业务 code，2xx 视为成功。
  void _requireSuccess(ApiResponse response) {
    if (response.code < 200 || response.code >= 300) {
      throw NetworkException(response.message);
    }
  }

  Future<List<EventModel>> getEvents(String start, String end) async {
    final json = await _client.get('/events', queryParameters: {
      'start': start,
      'end': end,
    });
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! List) {
        throw NetworkException('Unexpected response format for /events');
      }
      return data.map((e) => EventModel.fromJson(e as Map<String, dynamic>)).toList();
    });
    _requireSuccess(response);
    return response.data ?? [];
  }

  Future<EventModel> getEvent(int id) async {
    final json = await _client.get('/events/$id');
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! Map<String, dynamic>) {
        throw NetworkException('Unexpected response format for /events/$id');
      }
      return EventModel.fromJson(data);
    });
    _requireSuccess(response);
    final event = response.data;
    if (event == null) {
      throw NetworkException('Event not found in response');
    }
    return event;
  }

  Future<EventModel> createEvent(Map<String, dynamic> data) async {
    final json = await _client.post('/events', data: data);
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! Map<String, dynamic>) {
        throw NetworkException('Unexpected response format for /events');
      }
      return EventModel.fromJson(data);
    });
    _requireSuccess(response);
    final event = response.data;
    if (event == null) {
      throw NetworkException('Create event failed: empty response');
    }
    return event;
  }

  Future<EventModel> updateEvent(int id, Map<String, dynamic> data) async {
    final json = await _client.put('/events/$id', data: data);
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! Map<String, dynamic>) {
        throw NetworkException('Unexpected response format for /events/$id');
      }
      return EventModel.fromJson(data);
    });
    _requireSuccess(response);
    final event = response.data;
    if (event == null) {
      throw NetworkException('Update event failed: empty response');
    }
    return event;
  }

  Future<void> deleteEvent(int id) async {
    final json = await _client.delete('/events/$id');
    final response = ApiResponse.fromJson(json, (_) => null);
    _requireSuccess(response);
  }

  /// Search events with keyword, date range, and pagination.
  /// Returns a map with: items, total, page, limit, totalPages.
  Future<Map<String, dynamic>> searchEvents({
    String? keyword,
    String? start,
    String? end,
    int page = 1,
    int limit = 20,
  }) async {
    final safePage = page < 1 ? 1 : page;
    final safeLimit = limit < 1 ? 1 : (limit > 100 ? 100 : limit);
    final queryParameters = <String, dynamic>{
      'page': safePage,
      'limit': safeLimit,
    };
    if (keyword != null && keyword.isNotEmpty) {
      queryParameters['keyword'] = keyword;
    }
    if (start != null) {
      queryParameters['start'] = start;
    }
    if (end != null) {
      queryParameters['end'] = end;
    }

    final json = await _client.get('/events/search', queryParameters: queryParameters);
    final response = ApiResponse.fromJson(json, (data) {
      if (data is! Map<String, dynamic>) {
        throw NetworkException('Unexpected response format for /events/search');
      }
      return data;
    });
    _requireSuccess(response);
    return response.data ?? {};
  }
}
