// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../constants/app_constants.dart';

/// WebSocket 双向通道客户端（RG-6，后端 /ws?token=）。
///
/// 与 [SseClient] 对齐的输出：每帧 `{ event, data }`。
/// 内置：应用层 ping（20s）/ pong 超时（30s）检测 + 指数退避自动重连（1s→30s，
/// 收到任意服务端帧复位；收到 `connected` 帧后完全复位）。
class WsClient {
  final String Function() getAccessToken;
  final Duration pingInterval;
  final Duration pongTimeout;

  WsClient({
    required this.getAccessToken,
    this.pingInterval = const Duration(seconds: 20),
    this.pongTimeout = const Duration(seconds: 30),
  });

  final _events = StreamController<Map<String, dynamic>>.broadcast();

  /// 事件流：`{ event, data }`；含 connected / pong / notification / ai:* 等。
  Stream<Map<String, dynamic>> get events => _events.stream;

  WebSocketChannel? _channel;
  StreamSubscription? _messageSub;
  Timer? _pingTimer;
  Timer? _pongTimer;
  bool _closed = false;
  bool _pingOutstanding = false;
  int _retryMs = 1000;

  /// 幂等发起连接（含心跳与重连循环）。
  void connect() {
    if (_closed || _channel != null) return;
    _open();
  }

  /// 发送事件（服务端 @SubscribeMessage 匹配 `event` 字段）。
  void send(String event, [Map<String, dynamic>? data]) {
    _channel?.sink.add(jsonEncode({'event': event, 'data': data}));
  }

  void _open() {
    final base = AppConstants.resourceBaseUrl;
    final wsBase = base.startsWith('https') ? 'wss' : 'ws';
    final host = base.substring(base.indexOf('://') + 3);
    final token = getAccessToken();
    final url = '$wsBase://$host/ws?token=${Uri.encodeQueryComponent(token)}';
    final ch = WebSocketChannel.connect(Uri.parse(url));
    _channel = ch;
    _pingOutstanding = false;
    _messageSub = ch.stream.listen(
      _onFrame,
      onError: (_) => _scheduleReconnect(),
      onDone: _scheduleReconnect,
      cancelOnError: true,
    );
    _startPing();
  }

  void _onFrame(dynamic raw) {
    _pongTimer?.cancel();
    _pingOutstanding = false;
    try {
      final decoded = jsonDecode(raw as String);
      if (decoded is Map<String, dynamic>) {
        final event = decoded['event'];
        if (event == 'connected') {
          _retryMs = 1000;
          _events.add({'event': 'connected', 'data': decoded['data']});
        } else if (event == 'pong') {
          _events.add({'event': 'pong', 'data': null});
        } else {
          // 任意业务帧说明连接健康，重置退避
          _retryMs = 1000;
          _events.add(decoded);
        }
      }
    } catch (_) {
      // 忽略非 JSON 帧
    }
  }

  void _startPing() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(pingInterval, (_) {
      if (_channel == null || _pingOutstanding) return;
      _pingOutstanding = true;
      _channel!.sink.add(jsonEncode({'event': 'ping', 'data': null}));
      _pongTimer?.cancel();
      _pongTimer = Timer(pongTimeout, _scheduleReconnect);
    });
  }

  void _scheduleReconnect() {
    _teardownChannel();
    if (_closed) return;
    _events.add({'event': 'ws:reconnecting', 'data': {'retryMs': _retryMs}});
    Timer(Duration(milliseconds: _retryMs), () {
      if (_closed || _channel != null) return;
      _open();
    });
    _retryMs = (_retryMs * 2).clamp(1000, 30000);
  }

  void _teardownChannel() {
    _pingTimer?.cancel();
    _pongTimer?.cancel();
    _messageSub?.cancel();
    _channel?.sink.close();
    _channel = null;
  }

  void dispose() {
    _closed = true;
    _teardownChannel();
    _events.close();
  }
}
