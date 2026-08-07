import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/event_model.dart';

class EventsRepository {
  final ApiClient _client;

  EventsRepository(this._client);

  Future<List<EventModel>> getEvents(String start, String end) async {
    final json = await _client.get('/events', queryParameters: {
      'start': start,
      'end': end,
    });
    final response = ApiResponse.fromJson(json, (data) {
      if (data is List) {
        return data.map((e) => EventModel.fromJson(e as Map<String, dynamic>)).toList();
      }
      return <EventModel>[];
    });
    return response.data ?? [];
  }

  Future<EventModel> getEvent(int id) async {
    final json = await _client.get('/events/$id');
    final response = ApiResponse.fromJson(json, (data) => EventModel.fromJson(data));
    return response.data!;
  }

  Future<EventModel> createEvent(Map<String, dynamic> data) async {
    final json = await _client.post('/events', data: data);
    final response = ApiResponse.fromJson(json, (data) => EventModel.fromJson(data));
    return response.data!;
  }

  Future<EventModel> updateEvent(int id, Map<String, dynamic> data) async {
    final json = await _client.put('/events/$id', data: data);
    final response = ApiResponse.fromJson(json, (data) => EventModel.fromJson(data));
    return response.data!;
  }

  Future<void> deleteEvent(int id) async {
    final json = await _client.delete('/events/$id');
    ApiResponse.fromJson(json, (_) => null);
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
    final queryParameters = <String, dynamic>{
      'page': page,
      'limit': limit,
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
    final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
    return response.data ?? {};
  }
}
