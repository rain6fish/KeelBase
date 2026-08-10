import '../../../../core/api/api_client.dart';

class FeedbackRepository {
  final ApiClient _client;

  FeedbackRepository(this._client);

  Future<void> submit({
    required String type,
    required String content,
    String? contact,
  }) async {
    await _client.post('/feedback', data: {
      'type': type,
      'content': content,
      if (contact != null && contact.isNotEmpty) 'contact': contact,
    });
  }
}
