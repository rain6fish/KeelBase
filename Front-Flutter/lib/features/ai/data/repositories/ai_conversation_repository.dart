import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/conversation_summary.dart';

/// 对话历史数据访问。GET/DELETE /ai/conversations 用 ApiClient（非 SSE）。
class AiConversationRepository {
  final ApiClient _client;

  AiConversationRepository(this._client);

  Future<List<ConversationSummary>> getConversations() async {
    final json = await _client.get('/ai/conversations');
    final response = ApiResponse.fromJson(json, (data) {
      if (data is List) {
        return data
            .map((e) => ConversationSummary.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return <ConversationSummary>[];
    });
    return response.data ?? [];
  }

  /// 加载单个对话的完整消息（messages 含 role/content/timestamp）
  Future<Map<String, dynamic>> getConversation(String id) async {
    final json = await _client.get('/ai/conversations/$id');
    final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
    return response.data!;
  }

  Future<void> deleteConversation(String id) async {
    await _client.delete('/ai/conversations/$id');
  }
}
