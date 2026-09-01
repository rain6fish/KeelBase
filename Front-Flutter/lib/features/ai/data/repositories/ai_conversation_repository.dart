// SPDX-License-Identifier: Apache-2.0

import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/errors/exceptions.dart';
import '../models/ai_trace_models.dart';
import '../models/conversation_summary.dart';

/// 对话历史数据访问。GET/DELETE /ai/conversations 用 ApiClient（非 SSE）。
class AiConversationRepository {
  final ApiClient _client;

  AiConversationRepository(this._client);

  /// 后端统一响应以 HTTP 状态码作为业务 code，2xx 视为成功（与 EventsRepository 一致）。
  void _requireSuccess(ApiResponse response) {
    if (response.code < 200 || response.code >= 300) {
      throw NetworkException(response.message);
    }
  }

  /// 校验对话 id，防止恶意 id 篡改请求路径 / 路径穿越。
  void _validateId(String id) {
    if (id.isEmpty ||
        id.contains('/') ||
        id.contains('?') ||
        id.contains('#') ||
        id.contains('..')) {
      throw ValidationException('Invalid conversation id');
    }
  }

  Future<List<ConversationSummary>> getConversations() async {
    final json = await _client.get('/ai/conversations');
    final response = ApiResponse.fromJson(json, (data) => data);
    _requireSuccess(response);
    final data = response.data;
    if (data == null) return const [];
    if (data is! List) {
      throw NetworkException('Unexpected response format for /ai/conversations');
    }
    final result = <ConversationSummary>[];
    for (final e in data) {
      // 跳过畸形条目，避免单个坏数据拖垮整个列表解析
      if (e is Map<String, dynamic>) {
        result.add(ConversationSummary.fromJson(e));
      }
    }
    return result;
  }

  /// 加载单个对话的完整消息（messages 含 role/content/timestamp）
  Future<Map<String, dynamic>> getConversation(String id) async {
    _validateId(id);
    final json = await _client.get('/ai/conversations/$id');
    final response = ApiResponse.fromJson(json, (data) => data);
    _requireSuccess(response);
    final data = response.data;
    if (data is! Map<String, dynamic>) {
      throw NetworkException('Unexpected response format for /ai/conversations/$id');
    }
    return data;
  }

  /// 加载单条对话的执行轨迹（P0-14）：工具调用/确认/副作用/结果
  Future<AiTrace> getTrace(String id) async {
    _validateId(id);
    final json = await _client.get('/ai/conversations/$id/trace');
    final response = ApiResponse.fromJson(json, (data) => data);
    _requireSuccess(response);
    final data = response.data;
    if (data is! Map<String, dynamic>) {
      throw NetworkException('Unexpected response format for /ai/conversations/$id/trace');
    }
    return AiTrace.fromJson(data);
  }

  /// P0-15：撤销本人 AI 创建的记录（软删可恢复）
  Future<void> revokeEffect(int effectId) async {
    final json = await _client.delete('/ai/my/tool-effects/$effectId');
    final response = ApiResponse.fromJson(json, (_) => null);
    _requireSuccess(response);
  }

  Future<void> deleteConversation(String id) async {
    _validateId(id);
    final json = await _client.delete('/ai/conversations/$id');
    final response = ApiResponse.fromJson(json, (_) => null);
    _requireSuccess(response);
  }
}
