// SPDX-License-Identifier: Apache-2.0

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

  /// 可选：SSE 401 时刷新 access token 并返回新值（返回 null 表示刷新失败）。
  final Future<String?> Function()? refreshToken;

  SseClient({required this.getAccessToken, this.refreshToken});

  /// POST 请求并返回 SSE 事件流。
  /// 每个事件为 { type, data }，type 对应 event: 行，data 为 JSON 解析后的 Map。
  ///
  /// 处理规则：
  /// - 跨 chunk 的行缓冲：长 `data:` 行被 TCP 拆成多段时仍作为一个完整行解析；
  /// - 字段按 `field: value` 解析（允许无空格形式），`:` 前缀的注释行被忽略；
  /// - 事件在空白行（或流结束）时派发，多行 `data:` 用 `\n` 合并为一条；
  /// - `[DONE]` 数据发出 `{type: 'done', data: null}` 后立即终止流（干净结束，不重连）；
  /// - 非 200 状态、流错误转为 `{type: 'error', data: {'error': ...}}`；
  /// - 编程错误（[Error]）向上抛出，不会被吞成 error 事件。
  ///
  /// 断流恢复（CR-17）：
  /// - `reconnect=true` 时，服务端断流（无 `[DONE]`）按指数退避自动重连，
  ///   最多 `maxAttempts` 次；
  /// - 401 且配置了 [refreshToken] 时，先刷新再重试（限次），不把 401 当最终错误；
  /// - 重试耗尽后透传最后一次错误；干净结束（`[DONE]`）或 `reconnect=false`
  ///   保持原有语义（正常终止不额外发错误）。
  Stream<Map<String, dynamic>> postStream(
    String path, {
    Map<String, dynamic>? body,
    bool reconnect = false,
    int maxAttempts = 3,
    Duration initialBackoff = const Duration(seconds: 2),
  }) async* {
    var attempt = 0;
    var currentToken = getAccessToken();
    String? lastError;

    while (true) {
      lastError = null; // 每次新连接重置，避免上一次失败的错误残留到成功流后
      if (attempt > 0) {
        // 指数退避：2s / 4s / 8s …
        final backoffMs = initialBackoff.inMilliseconds * (1 << (attempt - 1));
        await Future<void>.delayed(Duration(milliseconds: backoffMs));
        currentToken = getAccessToken();
        final refreshed = await refreshToken?.call();
        if (refreshed != null && refreshed.isNotEmpty) currentToken = refreshed;
      }
      attempt++;

      final uri = Uri.parse('${AppConstants.activeBaseUrl}$path');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      };
      if (currentToken.isNotEmpty) {
        headers['Authorization'] = 'Bearer $currentToken';
      }

      final client = http.Client();
      var cleanEnd = false;
      var shouldRetry = false;
      try {
        final request = http.Request('POST', uri)
          ..headers.addAll(headers)
          ..body = body != null ? jsonEncode(body) : '{}';

        final response = await client.send(request);

        if (response.statusCode == 401 && refreshToken != null) {
          // 401：刷新 token 后重试（受 maxAttempts 限制）
          lastError = 'HTTP 401';
          shouldRetry = true;
        } else if (response.statusCode != 200) {
          lastError = 'HTTP ${response.statusCode}';
          yield {'type': 'error', 'data': {'error': lastError}};
          return;
        } else {
          String? currentEventType;
          final dataLines = <String>[];
          final lineBuffer = StringBuffer();
          var stopped = false;

          // 处理一条完整行（不含末尾 '\n'），返回需要派发的事件列表。
          // 捕获其用到的局部状态，通过返回值向外派发（async* 内不能在闭包中 yield）。
          List<Map<String, dynamic>> handleLine(String line) {
            final events = <Map<String, dynamic>>[];
            if (line.startsWith(':')) {
              // 注释行：忽略
              return events;
            }
            final colon = line.indexOf(':');
            final field = colon < 0 ? line : line.substring(0, colon);
            final value = colon < 0 ? '' : line.substring(colon + 1).trim();
            switch (field) {
              case 'event':
                currentEventType = value;
                break;
              case 'data':
                dataLines.add(value);
                break;
              case '':
                // 空白行 → 派发一个完整事件
                if (dataLines.isNotEmpty) {
                  final payload = dataLines.join('\n');
                  final type = currentEventType;
                  dataLines.clear();
                  currentEventType = null;
                  if (payload == '[DONE]') {
                    events.add({'type': 'done', 'data': null});
                  } else {
                    events.add(_buildEvent(type, payload));
                  }
                } else {
                  currentEventType = null;
                }
                break;
              default:
                // 'id:' / 'retry:' 等未知字段：忽略
                break;
            }
            return events;
          }

          await for (final chunk in response.stream.transform(utf8.decoder)) {
            lineBuffer.write(chunk);
            var buf = lineBuffer.toString();
            var newlineIdx = buf.indexOf('\n');
            while (newlineIdx >= 0) {
              final line = buf.substring(0, newlineIdx);
              buf = buf.substring(newlineIdx + 1);
              newlineIdx = buf.indexOf('\n');
              for (final event in handleLine(line)) {
                if (event['type'] == 'done' && event['data'] == null) {
                  stopped = true;
                  cleanEnd = true;
                }
                yield event;
              }
              if (stopped) return; // [DONE] 已收到：干净结束，不重连
            }
            lineBuffer
              ..clear()
              ..write(buf);
          }

          // 流结束：处理未换行的最后一行 + 未以空白行结尾的 data 块。
          if (!stopped && lineBuffer.isNotEmpty) {
            final line = lineBuffer.toString();
            lineBuffer.clear();
            for (final event in handleLine(line)) {
              if (event['type'] == 'done' && event['data'] == null) {
                stopped = true;
                cleanEnd = true;
              }
              yield event;
            }
          }
          if (!stopped && dataLines.isNotEmpty) {
            final payload = dataLines.join('\n');
            final type = currentEventType;
            if (payload == '[DONE]') {
              yield {'type': 'done', 'data': null};
            } else {
              yield _buildEvent(type, payload);
            }
          }
        }
      } catch (e) {
        if (e is Error) rethrow; // 编程错误向上抛出，不伪装成 error 事件
        lastError = e.toString();
        if (reconnect && attempt < maxAttempts) {
          shouldRetry = true;
        } else {
          yield {'type': 'error', 'data': {'error': lastError}};
          return;
        }
      } finally {
        // 正常/非 200/流错误/消费者取消 均关闭连接，避免泄漏。
        client.close();
      }

      if (shouldRetry && attempt < maxAttempts) continue;
      if (reconnect && !cleanEnd && attempt < maxAttempts) continue;
      // 重试耗尽：非干净结束则透传最后一次错误，让上层感知
      if (!cleanEnd && lastError != null) {
        yield {'type': 'error', 'data': {'error': lastError}};
      }
      return;
    }
  }

  /// 把单条 `data:` 载荷解析为事件：合法 JSON 对象 → 结构化事件；
  /// 其余（纯文本 / JSON 字符串等）→ `text` 事件。
  Map<String, dynamic> _buildEvent(String? type, String payload) {
    Object? decoded;
    try {
      decoded = jsonDecode(payload);
    } catch (_) {
      decoded = null;
    }
    if (decoded is Map<String, dynamic>) {
      return {'type': type ?? 'message', 'data': decoded};
    }
    // JSON 字符串去引号，纯文本原样。
    final content = decoded is String ? decoded : payload;
    return {
      'type': 'text',
      'data': {'type': 'text', 'content': content},
    };
  }
}
