import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../constants/app_constants.dart';

/// Lightweight SSE (Server-Sent Events) client.
///
/// Flutter Web 的 Dio 不支持 ResponseType.stream，所以单独用 http 包处理 SSE。
/// 手动读取 accessToken（通过外部传入），避免依赖 Dio 拦截器。
class SseClient {
  final String Function() getAccessToken;

  SseClient({required this.getAccessToken});

  /// POST 请求并返回 SSE 事件流。
  /// 每个事件为 { type, data }，type 对应 event: 行，data 为 JSON 解析后的 Map。
  Stream<Map<String, dynamic>> postStream(String path,
      {Map<String, dynamic>? body}) async* {
    final uri = Uri.parse('${AppConstants.activeBaseUrl}$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    final token = getAccessToken();
    if (token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    try {
      final client = http.Client();
      // 使用流式请求
      final request = http.Request('POST', uri)
        ..headers.addAll(headers)
        ..body = body != null ? jsonEncode(body) : '{}';

      final response = await client.send(request);

      if (response.statusCode != 200) {
        yield {'type': 'error', 'data': {'error': 'HTTP ${response.statusCode}'}};
        return;
      }

      String? currentEventType;
      await for (final chunk in response.stream.transform(utf8.decoder)) {
        for (final line in chunk.split('\n')) {
          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            final payload = line.substring(6).trim();
            if (payload == '[DONE]') {
              yield {'type': 'done', 'data': null};
            } else {
              try {
                final json = jsonDecode(payload) as Map<String, dynamic>;
                yield {'type': currentEventType ?? 'message', 'data': json};
              } catch (_) {
                yield {
                  'type': 'text',
                  'data': {'type': 'text', 'content': payload},
                };
              }
            }
            currentEventType = null;
          }
        }
      }

      client.close();
    } catch (e) {
      yield {'type': 'error', 'data': {'error': e.toString()}};
    }
  }
}
